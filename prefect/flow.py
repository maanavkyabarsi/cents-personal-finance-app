import prefect
import subprocess
import json
import os
import sys
import tempfile
from dotenv import load_dotenv
from prefect.blocks.system import Secret
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ingestion'))
import main
from main import *

load_dotenv()

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
    dbt_project_dir = os.path.join(os.path.dirname(__file__), "..", "dbt")
    profiles_dir = os.path.join(dbt_project_dir, "profiles")

    result = subprocess.run(
        ["dbt", "run", "--project-dir", dbt_project_dir, "--profiles-dir", profiles_dir],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        raise Exception(f"dbt run failed:\n{result.stderr}")

@prefect.flow
def daily_sync():
    sa_key = Secret.load("gcp-sa-key").get()
    sa_key_dict = sa_key if isinstance(sa_key, dict) else json.loads(sa_key)
    sa_key_json = json.dumps(sa_key_dict)

    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    tmp.write(sa_key_json)
    tmp.close()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name

    project_id = sa_key_dict["project_id"]
    os.environ["PROJECT_ID"] = project_id
    main.project_id = project_id

    item_ids = fetch_item_ids()
    print(f"Fetched {len(item_ids)} accounts")
    for item_id in item_ids:
        sync_and_store(item_id)
    run_dbt()

if __name__ == "__main__":
    daily_sync()
