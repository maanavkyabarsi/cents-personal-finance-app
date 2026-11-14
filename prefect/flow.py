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
    transactions, removed_ids, final_cursor = transactions_sync(item_id)
    write_to_bronze(transactions=transactions, removed_ids=removed_ids)
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

# The dashboard rebuilds gold.spending_adjustments when a transaction is ignored or
# manually tagged; this rebuilds it against the freshly built silver so Plaid
# modifications, recategorizations and removals are reflected. adjustment is an amount to
# subtract: ignored/tagged transactions are subtracted at their original key, and tagged,
# non-ignored ones are added (negative adjustment) at the tagged category. The pfc_detailed
# filter must match dbt/models/gold/gold_spending_by_category.sql exactly (including
# dropping NULLs), as must ADJUSTMENT_ROWS_SQL in dashboard/lib/queries.ts.
@prefect.task
def rebuild_spending_adjustments():
    bq_client = bigquery.Client()
    query = """
        CREATE TABLE IF NOT EXISTS gold.ignored_transactions (
            transaction_id STRING NOT NULL,
            ignored_at TIMESTAMP,
            ignored_by STRING
        );

        CREATE TABLE IF NOT EXISTS gold.transaction_categories (
            transaction_id STRING NOT NULL,
            primary_category STRING,
            tagged_at TIMESTAMP,
            tagged_by STRING
        );

        CREATE OR REPLACE TABLE gold.spending_adjustments AS
        SELECT
            account_id,
            primary_category,
            detailed_category,
            month,
            ROUND(SUM(adjustment), 2) AS adjustment
        FROM (
            SELECT
                t.account_id,
                t.pfc_primary AS primary_category,
                t.pfc_detailed AS detailed_category,
                DATE_TRUNC(t.transaction_date, MONTH) AS month,
                t.amount AS adjustment
            FROM silver.transactions AS t
            WHERE t.pfc_detailed != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
                AND (
                    EXISTS (SELECT 1 FROM gold.ignored_transactions AS i WHERE i.transaction_id = t.transaction_id)
                    OR EXISTS (SELECT 1 FROM gold.transaction_categories AS c WHERE c.transaction_id = t.transaction_id)
                )

            UNION ALL

            SELECT
                t.account_id,
                c.primary_category,
                CAST(NULL AS STRING) AS detailed_category,
                DATE_TRUNC(t.transaction_date, MONTH) AS month,
                -t.amount AS adjustment
            FROM silver.transactions AS t
            JOIN gold.transaction_categories AS c USING (transaction_id)
            WHERE t.pfc_detailed != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
                AND NOT EXISTS (SELECT 1 FROM gold.ignored_transactions AS i WHERE i.transaction_id = t.transaction_id)
        )
        GROUP BY 1, 2, 3, 4;
    """
    bq_client.query(query, location="US").result()
    print("Rebuilt gold.spending_adjustments")

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
    sync_accounts()
    run_dbt()
    rebuild_spending_adjustments()

if __name__ == "__main__":
    daily_sync()
