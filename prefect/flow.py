import requests
import prefect
import subprocess
import json
import os
from dotenv import load_dotenv
from google.cloud import secretmanager


load_dotenv()
project_id=os.getenv("PROJECT_ID")

def secret_value_puller(secret_name: str):
    sm_client = secretmanager.SecretManagerServiceClient(transport="rest")
    name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
    response = sm_client.access_secret_version(request={"name": name})
    payload = response.payload.data.decode("UTF-8")
    return payload

@prefect.task
def fetch_item_ids():
    payload = secret_value_puller("plaid-item-map")
    item_ids = list(json.loads(payload).keys())
    return item_ids