import os
from datetime import datetime, timezone
from dotenv import load_dotenv
import functions_framework
import json
import plaid
from plaid.api import plaid_api
from plaid import ApiClient, Configuration
from google.cloud import bigquery
from google.cloud import secretmanager
from plaid.model.transactions_sync_request import TransactionsSyncRequest

load_dotenv()
project_id=os.getenv("PROJECT_ID")

def secret_value_puller(secret_name: str):
    sm_client = secretmanager.SecretManagerServiceClient(transport="rest")
    name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
    response = sm_client.access_secret_version(request={"name": name})
    payload = response.payload.data.decode("UTF-8")
    return payload

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


@functions_framework.http
def handle_webhook(request):
    if not request.headers.get('Plaid-Verification'):
        return ('Unauthorized', 401)
    print("Webhook received")
    body = request.get_json()
    print(f"Body: {body}")
    if body['webhook_type'] == "TRANSACTIONS" and body['webhook_code'] == "SYNC_UPDATES_AVAILABLE":
        print("Calling transactions_sync")
        transactions, cursor = transactions_sync(body['item_id'])
        write_to_bronze(transactions=transactions)
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

    try:
        cursor = secret_value_puller(secret_name=f"plaid-cursor-{item_id}")
        print(f"Cursor: {cursor}")
        request = TransactionsSyncRequest(access_token=access_token, cursor=cursor)
        print("Using saved cursor")
    except Exception:
        request = TransactionsSyncRequest(access_token=access_token)
        print("No saved cursor found, starting fresh")
    response = client.transactions_sync(request)

    transactions = list(response.added)
    while response.has_more:
        request = TransactionsSyncRequest(
            access_token=access_token,
            cursor=response.next_cursor
        )
        response = client.transactions_sync(request)
        transactions += response.added

    final_cursor = response.next_cursor
    print(f"Got {len(transactions)} transactions")
    return transactions, final_cursor

def write_to_bronze(transactions):
    print(f"Writing {len(transactions)} transactions to bronze")

    bq_client = bigquery.Client()
    table_id = f"{project_id}.bronze.transactions"
    rows_to_insert = [
        {
            "raw_data": json.dumps(t.to_dict(), default=str),
            "ingested_at": datetime.now(timezone.utc).isoformat()
        }
        for t in transactions
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

def save_cursor(item_id, cursor):
    secret_name = f"plaid-cursor-{item_id}"
    sm_client = secretmanager.SecretManagerServiceClient()
    
    try:
        existing_cursor = secret_value_puller(secret_name=secret_name)

        parent = sm_client.secret_path(project_id, secret_name)
        sm_client.add_secret_version(
            request={
                'parent': parent,
                'payload': {
                    'data': cursor.encode('UTF-8')
                }
            }
        )

    except Exception:
        parent = f"projects/{project_id}"

        sm_client.create_secret(
            request= {
                'parent': parent,
                'secret_id': secret_name,
                'secret': {"replication": {"automatic": {}}}
            }
        )
        parent = sm_client.secret_path(project_id, secret_name)
        sm_client.add_secret_version(
            request={
                'parent': parent,
                'payload': {
                    'data': cursor.encode('UTF-8')
                }
            }
        )

@functions_framework.http
def test_sync(request):
    transactions, cursor = transactions_sync("y1Q0kOgzdnS8bNOvDjwKsbBoQ603ewIXavb0P")
    write_to_bronze(transactions=transactions)
    save_cursor("y1Q0kOgzdnS8bNOvDjwKsbBoQ603ewIXavb0P")
    return (f"Synced {len(transactions)} transactions", 200)

if __name__ == "__main__":
    transactions, cursor = transactions_sync("y1Q0kOgzdnS8bNOvDjwKsbBoQ603ewIXavb0P")
    write_to_bronze(transactions=transactions)
    save_cursor("y1Q0kOgzdnS8bNOvDjwKsbBoQ603ewIXavb0P", cursor)
    print(f"Synced {len(transactions)} transactions")
