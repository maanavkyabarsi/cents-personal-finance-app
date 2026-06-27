import prefect
import subprocess
import json
import os
import sys
from dotenv import load_dotenv
from google.cloud import secretmanager
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ingestion'))
from main import *

load_dotenv()
project_id=os.getenv("PROJECT_ID")

@prefect.task
def fetch_item_ids():
    payload = secret_value_puller("plaid-item-map")
    item_ids = list(json.loads(payload).keys())
    return item_ids

@prefect.task
def sync_and_store(item_id):
    transactions, final_cursor = transactions_sync(item_id)
    write_to_bronze(transactions=transactions)
    save_cursor(item_id, final_cursor)

@prefect.task
def run_dbt():
    dbt_project_dir = os.path.join(os.path.dirname(__file__), "..")
    dbt_bin = os.path.join(dbt_project_dir, "ingestion", ".venv", "bin", "dbt")

    result = subprocess.run(
        [dbt_bin, "run", "--project-dir", dbt_project_dir, "--profiles-dir", os.path.expanduser("~/.dbt")],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        raise Exception(f"dbt run failed:\n{result.stderr}")
    
@prefect.flow
def daily_sync():
    item_ids = fetch_item_ids()
    print(f"Fetched {len(item_ids)} accounts")
    for item_id in item_ids:
        sync_and_store(item_id)
    run_dbt()

if __name__ == "__main__":
    daily_sync()