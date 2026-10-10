import os
import re
import sys
import time
import hashlib
import hmac
import jwt
from datetime import datetime, timezone
from dotenv import load_dotenv
import functions_framework
import json
import plaid
from plaid.api import plaid_api
from plaid import ApiClient, Configuration
from google.cloud import bigquery
from google.cloud import secretmanager
from google.cloud import firestore
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.webhook_verification_key_get_request import WebhookVerificationKeyGetRequest

load_dotenv()
project_id=os.getenv("PROJECT_ID")

def secret_value_puller(secret_name: str):
    sm_client = secretmanager.SecretManagerServiceClient(transport="rest")
    name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
    response = sm_client.access_secret_version(request={"name": name})
    payload = response.payload.data.decode("UTF-8")
    return payload

def get_cursor(item_id):
    db = firestore.Client()
    doc = db.collection("plaid_cursors").document(item_id).get()
    if not doc.exists:
        return None
    return doc.to_dict().get("cursor")

def save_cursor(item_id, cursor):
    db = firestore.Client()
    db.collection("plaid_cursors").document(item_id).set({
        "cursor": cursor,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

def get_credentials():
    plaid_client_id = secret_value_puller(secret_name="plaid-client-id")
    plaid_secret = secret_value_puller(secret_name="plaid-secret")
    return plaid_client_id, plaid_secret

def get_plaid_client():
    plaid_client_id, plaid_secret = get_credentials()
    configuration = plaid.Configuration(
        host=plaid.Environment.Production,
        api_key={
            'clientId': plaid_client_id,
            'secret': plaid_secret,
        }
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client)


# Plaid signs each webhook with an ES256 JWT in the Plaid-Verification header.
# See https://plaid.com/docs/api/webhooks/webhook-verification/
WEBHOOK_MAX_AGE_SECONDS = 5 * 60
_webhook_key_cache = {}

def get_webhook_verification_key(key_id):
    if key_id not in _webhook_key_cache:
        client = get_plaid_client()
        response = client.webhook_verification_key_get(
            WebhookVerificationKeyGetRequest(key_id=key_id)
        )
        _webhook_key_cache[key_id] = response.key.to_dict()
    return _webhook_key_cache[key_id]

def verify_webhook(token, raw_body):
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "ES256":
            return False
        jwk_dict = get_webhook_verification_key(header["kid"])
        if jwk_dict.get("expired_at"):
            return False
        public_key = jwt.PyJWK(jwk_dict, algorithm="ES256").key
        claims = jwt.decode(token, public_key, algorithms=["ES256"])
    except Exception as e:
        print(f"Webhook verification failed: {e}")
        return False

    if time.time() - claims.get("iat", 0) > WEBHOOK_MAX_AGE_SECONDS:
        print("Webhook verification failed: token too old")
        return False
    body_hash = hashlib.sha256(raw_body).hexdigest()
    return hmac.compare_digest(body_hash, claims.get("request_body_sha256", ""))

@functions_framework.http
def handle_webhook(request):
    token = request.headers.get('Plaid-Verification')
    if not token or not verify_webhook(token, request.get_data()):
        return ('Unauthorized', 401)
    print("Webhook received")
    body = request.get_json()
    print(f"Body: {body}")
    if body['webhook_type'] == "TRANSACTIONS" and body['webhook_code'] == "SYNC_UPDATES_AVAILABLE":
        print("Calling transactions_sync")
        transactions, removed_ids, cursor = transactions_sync(body['item_id'])
        write_to_bronze(transactions=transactions, removed_ids=removed_ids)
        save_cursor(body['item_id'], cursor)
        return ("OK", 200)
    else:
        return ("Ignored", 200)

def get_access_token(item_id):
    print(f"Getting access token for item_id: {item_id}")
    plaid_item_map = json.loads(secret_value_puller(secret_name="plaid-item-map"))
    secret_name = plaid_item_map.get(item_id)
    print(f"Secret name: {secret_name}")
    return secret_value_puller(secret_name=secret_name)

def transactions_sync(item_id):
    access_token = get_access_token(item_id=item_id)
    client = get_plaid_client()

    cursor = get_cursor(item_id)
    if cursor:
        print(f"Cursor: {cursor}")
        request = TransactionsSyncRequest(access_token=access_token, cursor=cursor)
        print("Using saved cursor")
    else:
        request = TransactionsSyncRequest(access_token=access_token)
        print("No saved cursor found, starting fresh")
    response = client.transactions_sync(request)

    added = list(response.added)
    modified = list(response.modified)
    removed_ids = [r.transaction_id for r in response.removed]
    while response.has_more:
        request = TransactionsSyncRequest(
            access_token=access_token,
            cursor=response.next_cursor
        )
        response = client.transactions_sync(request)
        added += response.added
        modified += response.modified
        removed_ids += [r.transaction_id for r in response.removed]

    final_cursor = response.next_cursor
    print(f"Got {len(added)} added, {len(modified)} modified, {len(removed_ids)} removed")
    return added + modified, removed_ids, final_cursor

def write_to_bronze(transactions, removed_ids=None):
    print(f"Writing {len(transactions)} transactions to bronze")

    bq_client = bigquery.Client()
    table_id = f"{project_id}.bronze.transactions"
    now = datetime.now(timezone.utc).isoformat()
    rows_to_insert = [
        {
            "raw_data": json.dumps(t.to_dict(), default=str),
            "ingested_at": now
        }
        for t in transactions
    ]
    if removed_ids:
        rows_to_insert += [
            {
                "raw_data": json.dumps({"transaction_id": tid, "removed": True}),
                "ingested_at": now
            }
            for tid in removed_ids
        ]
    print(f"Rows to insert: {len(rows_to_insert)}")
    if not rows_to_insert:
        print("No new transactions to write.")
        return
    errors = bq_client.insert_rows_json(table_id, rows_to_insert)
    if errors == []:
        print("New rows have been added.")
    else:
        print("Encountered errors while inserting rows: {}".format(errors))

def clean_display_name(name, official, mask):
    base = (official or name or "").replace("�", "").strip()
    base = re.sub(r"\s*[.…]{2,}\s*\d{3,}$", "", base).strip()
    base = re.sub(r"\s+", " ", base)
    if base and base.isupper():
        base = base.title()
    if not base:
        base = "Account"
    return f"{base} ••{mask}" if mask else base

def sync_accounts():
    plaid_item_map = json.loads(secret_value_puller(secret_name="plaid-item-map"))
    client = get_plaid_client()
    now = datetime.now(timezone.utc).isoformat()

    rows = []
    for item_id in plaid_item_map:
        access_token = get_access_token(item_id=item_id)
        response = client.accounts_get(AccountsGetRequest(access_token=access_token))
        for a in response.accounts:
            rows.append({
                "account_id": a.account_id,
                "name": a.name,
                "official_name": a.official_name,
                "display_name": clean_display_name(a.name, a.official_name, a.mask),
                "mask": a.mask,
                "type": str(a.type),
                "subtype": str(a.subtype),
                "item_id": item_id,
                "updated_at": now,
            })

    print(f"Syncing {len(rows)} accounts to gold.accounts")
    bq_client = bigquery.Client()
    table_id = f"{project_id}.gold.accounts"
    schema = [
        bigquery.SchemaField("account_id", "STRING"),
        bigquery.SchemaField("name", "STRING"),
        bigquery.SchemaField("official_name", "STRING"),
        bigquery.SchemaField("display_name", "STRING"),
        bigquery.SchemaField("mask", "STRING"),
        bigquery.SchemaField("type", "STRING"),
        bigquery.SchemaField("subtype", "STRING"),
        bigquery.SchemaField("item_id", "STRING"),
        bigquery.SchemaField("updated_at", "TIMESTAMP"),
    ]
    bq_client.create_table(bigquery.Table(table_id, schema=schema), exists_ok=True)
    job = bq_client.load_table_from_json(
        rows,
        table_id,
        job_config=bigquery.LoadJobConfig(
            schema=schema,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        ),
    )
    job.result()
    return rows

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python main.py ITEM_ID")
    item_id = sys.argv[1]
    transactions, removed_ids, cursor = transactions_sync(item_id)
    write_to_bronze(transactions=transactions, removed_ids=removed_ids)
    save_cursor(item_id, cursor)
    print(f"Synced {len(transactions)} transactions")
