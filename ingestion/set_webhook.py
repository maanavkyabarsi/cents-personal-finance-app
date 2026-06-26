import plaid
from plaid.api import plaid_api
from plaid.model.item_webhook_update_request import ItemWebhookUpdateRequest
from google.cloud import secretmanager
import json
import os
from dotenv import load_dotenv

load_dotenv()
project_id = os.getenv("PROJECT_ID")

def secret_value_puller(secret_name):
    sm_client = secretmanager.SecretManagerServiceClient(transport="rest")
    name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
    response = sm_client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

plaid_client_id = secret_value_puller("plaid-client-id")
plaid_secret = secret_value_puller("plaid-secret")
access_token = secret_value_puller("plaid-access-token-wells-fargo")

configuration = plaid.Configuration(
    host=plaid.Environment.Production,
    api_key={"clientId": plaid_client_id, "secret": plaid_secret}
)
client = plaid_api.PlaidApi(plaid.ApiClient(configuration))

request = ItemWebhookUpdateRequest(
    access_token=access_token,
    webhook="YOUR_WEBHOOK_URL"
)
response = client.item_webhook_update(request)
print(response)