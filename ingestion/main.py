import os
from dotenv import load_dotenv
import functions_framework
import requests
import json
import plaid
from plaid.api import plaid_api
from plaid import ApiClient, Configuration
from google.cloud import bigquery
from google.cloud import secretmanager
from plaid.model.transactions_sync_request import TransactionsSyncRequest

load_dotenv()
project_id=os.getenv("PROJECT_ID")

sm_client = secretmanager.SecretManagerServiceClient()

def secret_value_puller(secret_name: str):
    name = "projects/" + f"{project_id}/" + "secrets/" + secret_name + "/versions/latest"
    response = sm_client.access_secret_version(request={"name": name})
    payload = response.payload.data.decode("UTF-8")
    return payload

plaid_client_id = secret_value_puller(secret_name="plaid-client-id")
plaid_secret = secret_value_puller(secret_name="plaid-secret")


def get_plaid_client():
    configuration = plaid.Configuration(
        host = plaid.Environment.Production,
        api_key = {
            'clientId': plaid_client_id,
            'secret': plaid_secret,
        }
    )

    api_client = plaid.ApiClient(configuration)
    client = plaid_api.PlaidApi(api_client)
    return client


@functions_framework.http
def handle_webhook(request):
    body = request.get_json()
    if body['webhook_type'] == "TRANSACTIONS" and body['webhook_code'] == "SYNC_UPDATES_AVAILABLE":
        # print("Webhook update received")
        transactions_sync(body['item_id'])

def get_access_token(item_id):
    plaid_item_map = secret_value_puller(secret_name="plaid-item-map")
    plaid_item_map = json.loads(plaid_item_map)
    secret_name = plaid_item_map.get(item_id)
    access_token = secret_value_puller(secret_name=secret_name)
    return access_token

def transactions_sync(item_id):
    access_token = get_access_token(item_id=item_id)
    client = get_plaid_client()
    request = TransactionsSyncRequest(
        access_token=access_token,
    )
    response = client.transactions_sync(request)
    transactions = response['added']

    while (response['has_more']):
        request = TransactionsSyncRequest(
            access_token = access_token,
            cursor = response['next_cursor']
        )
        response = client.transactions_sync(request)
        transactions += response['added']
    
    return transactions