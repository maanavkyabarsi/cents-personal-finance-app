import os
from dotenv import load_dotenv
import functions_framework
import requests
import plaid
from plaid.api import plaid_api
from plaid import ApiClient, Configuration
from google.cloud import bigquery
from google.cloud import secretmanager

load_dotenv()
project_id=os.getenv("PROJECT_ID")

client = secretmanager.SecretManagerServiceClient()

def secret_value_puller(secret_name: str):
    name = "projects/" + f"{project_id}/" + "secrets/" + secret_name + "/versions/latest"
    response = client.access_secret_version(request={"name": name})
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