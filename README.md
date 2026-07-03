# Cents: Personal Finance Pipeline — Setup Guide

An end-to-end pipeline that pulls your bank and card transactions from [Plaid](https://plaid.com/) into BigQuery, models them with dbt, and visualizes spending in a Next.js dashboard. Ingestion and transformation run every 6 hours via Prefect.

```
Plaid webhook → Cloud Function → bronze.transactions (raw JSON)
  → dbt silver_transactions → dbt gold_spending_by_category
  → Next.js API routes → dashboard
```
***LIVE DEMO:*** https://personal-finance-dashboard-live-dem.vercel.app/
---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Google Cloud Setup](#2-google-cloud-setup)
3. [Plaid Setup](#3-plaid-setup)
4. [GCP Secret Manager — Store Your Credentials](#4-gcp-secret-manager--store-your-credentials)
5. [Ingestion — Local Setup](#5-ingestion--local-setup)
6. [dbt Setup](#6-dbt-setup)
7. [Deploy the Cloud Function](#7-deploy-the-cloud-function)
8. [Register the Webhook with Plaid](#8-register-the-webhook-with-plaid)
9. [Dashboard Setup](#9-dashboard-setup)
10. [Prefect Orchestration](#10-prefect-orchestration)
11. [Architecture Reference](#11-architecture-reference)

---

## 1. Prerequisites

Install these before starting:

| Tool | Version | Install |
|---|---|---|
| Python | 3.12+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| Google Cloud SDK (`gcloud`) | latest | `brew install google-cloud-sdk` or [docs](https://cloud.google.com/sdk/docs/install) |
| dbt (BigQuery adapter) | any | installed via `requirements.txt` |
| Prefect | 3.x | installed via `requirements.txt` |

---

## 2. Google Cloud Setup

### 2a. Create a GCP project

If you don't already have a project:

```bash
gcloud projects create YOUR_PROJECT_ID --name="Finance Pipeline"
gcloud config set project YOUR_PROJECT_ID
```

Enable billing on the project in the [GCP Console](https://console.cloud.google.com/billing) — BigQuery, Secret Manager, and Cloud Functions all require it.

### 2b. Enable required APIs

```bash
gcloud services enable \
  bigquery.googleapis.com \
  secretmanager.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com
```

### 2c. Create BigQuery datasets

```bash
bq mk --dataset YOUR_PROJECT_ID:bronze
bq mk --dataset YOUR_PROJECT_ID:silver
bq mk --dataset YOUR_PROJECT_ID:gold
```

### 2d. Create the bronze table

The ingestion function writes raw JSON here. Create the table with the correct schema:

```bash
bq mk \
  --table \
  YOUR_PROJECT_ID:bronze.transactions \
  raw_data:STRING,ingested_at:TIMESTAMP
```

### 2e. Create a service account

This service account is used by the Cloud Function, Prefect, and the dashboard.

```bash
gcloud iam service-accounts create finance-pipeline-sa \
  --display-name="Finance Pipeline Service Account"
```

Grant it the necessary roles:

```bash
SA="finance-pipeline-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretVersionManager"
```

### 2f. Download a service account key

You need this key in two places: Prefect (step 10) and the dashboard (step 9).

```bash
gcloud iam service-accounts keys create ~/finance-sa-key.json \
  --iam-account=finance-pipeline-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 2g. Set up Application Default Credentials locally

This lets dbt and the ingestion script authenticate when running locally:

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

---

## 3. Plaid Setup

### 3a. Create a Plaid account

Sign up at [plaid.com](https://plaid.com/). You need access to the **Production** environment (requires a brief approval process from Plaid — submit a request in their dashboard).

### 3b. Get your Plaid credentials

In the [Plaid Dashboard](https://dashboard.plaid.com/):

1. Go to **Team Settings → Keys**
2. Copy your **Client ID** and **Production Secret**

### 3c. Link your bank accounts

Use [Plaid Link](https://plaid.com/docs/link/) to connect your bank accounts. Each linked institution gives you an **access token** and an **item ID**. Store these — you'll need them in the next step.

If you don't have a Link flow set up yet, Plaid's [Quickstart](https://github.com/plaid/quickstart) is the fastest way to get access tokens for your accounts.

---

## 4. GCP Secret Manager — Store Your Credentials

All secrets are stored in GCP Secret Manager. The ingestion code and Prefect flow read them at runtime — nothing sensitive goes in code or `.env` files in production.

### 4a. Store Plaid API credentials

```bash
echo -n "YOUR_PLAID_CLIENT_ID" | \
  gcloud secrets create plaid-client-id --data-file=- --project=YOUR_PROJECT_ID

echo -n "YOUR_PLAID_PRODUCTION_SECRET" | \
  gcloud secrets create plaid-secret --data-file=- --project=YOUR_PROJECT_ID
```

### 4b. Store access tokens for each linked account

For each bank account you linked via Plaid, store its access token. Pick a descriptive name (e.g. `plaid-access-token-chase`, `plaid-access-token-wells-fargo`):

```bash
echo -n "access-production-XXXX-XXXX" | \
  gcloud secrets create plaid-access-token-chase --data-file=- --project=YOUR_PROJECT_ID
```

Repeat this for every linked institution.

### 4c. Store the item map

`plaid-item-map` is a JSON object mapping each Plaid `item_id` → the name of the secret that holds that item's access token. This is how the ingestion code knows which access token to use when a webhook fires for a given item.

Build the JSON:

```json
{
  "item_id_for_chase": "plaid-access-token-chase",
  "item_id_for_wells_fargo": "plaid-access-token-wells-fargo"
}
```

Store it:

```bash
echo -n '{"item_id_for_chase":"plaid-access-token-chase","item_id_for_wells_fargo":"plaid-access-token-wells-fargo"}' | \
  gcloud secrets create plaid-item-map --data-file=- --project=YOUR_PROJECT_ID
```

> The `plaid-cursor-{item_id}` secrets are created **automatically** by the ingestion code the first time it syncs each item. You don't need to create them manually.

---

## 5. Ingestion — Local Setup

### 5a. Clone the repo and install Python deps

```bash
git clone https://github.com/maanavkyabarsi/cents-personal-finance-app
cd personal-finance-pipeline

cd ingestion
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r ../requirements.txt
```

### 5b. Create `ingestion/.env`

```bash
# ingestion/.env
PROJECT_ID=YOUR_PROJECT_ID
```

### 5c. Run the webhook handler locally

```bash
functions-framework --target handle_webhook --port 8080
```

This starts a local HTTP server on port 8080. To test it, you can use [ngrok](https://ngrok.com/) to expose it publicly and configure Plaid to send webhooks to your ngrok URL (see step 8).

---

## 6. dbt Setup

dbt reads `PROJECT_ID` from the environment and uses Application Default Credentials (set in step 2g) to authenticate to BigQuery.

```bash
# From repo root — make sure PROJECT_ID is set
export PROJECT_ID=YOUR_PROJECT_ID
dbt run --project-dir dbt --profiles-dir dbt/profiles
```

This creates and populates `silver.transactions` and `gold.spending_by_category`.

To run a single model:

```bash
dbt run --select silver_transactions --project-dir dbt --profiles-dir dbt/profiles
```

To verify the models compiled correctly without running them:

```bash
dbt compile --project-dir dbt --profiles-dir dbt/profiles
```

**How the schema names work:** `macros/generate_schema_name.sql` overrides dbt's default behavior so that `+schema: silver` produces a dataset named exactly `silver`, not `<profile_default>_silver`. This is why the BigQuery datasets you created in step 2c must be named exactly `bronze`, `silver`, and `gold`.

---

## 7. Deploy the Cloud Function

The ingestion handler runs as a Google Cloud Function (2nd gen) that Plaid calls when new transactions are available.

```bash
gcloud functions deploy handle-webhook \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=ingestion \
  --entry-point=handle_webhook \
  --trigger=http \
  --allow-unauthenticated \
  --service-account=finance-pipeline-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars=PROJECT_ID=YOUR_PROJECT_ID \
  --project=YOUR_PROJECT_ID
```

After deployment, note the function's URL from the output (it looks like `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/handle-webhook`). You'll need it in the next step.

> **Why `--allow-unauthenticated`?** Plaid sends webhook calls from its own servers; there's no way to inject a GCP identity token. The handler does a basic check for the `Plaid-Verification` header on every incoming request.

---

## 8. Register the Webhook with Plaid

Update each Plaid item to send webhooks to your deployed Cloud Function URL.

Edit `ingestion/set_webhook.py` — replace `YOUR_WEBHOOK_URL` with your Cloud Function URL:

```python
request = ItemWebhookUpdateRequest(
    access_token=access_token,
    webhook="https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/handle-webhook"
)
```

Also update the `access_token` line to pull the right secret (or loop over all items). Then run it from the `ingestion/` directory:

```bash
cd ingestion
source .venv/bin/activate
python set_webhook.py
```

Run this once per linked Plaid item. After this, Plaid will POST to your Cloud Function whenever new transactions are available.

---

## 9. Dashboard Setup

### 9a. Install dependencies

```bash
cd dashboard
npm install
```

### 9b. Create `dashboard/.env.local`

The dashboard needs a GCP service account key to query BigQuery directly from the API routes.

```bash
# dashboard/.env.local
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"YOUR_PROJECT_ID",...}
GCP_PROJECT_ID=YOUR_PROJECT_ID
```

For `GCP_SERVICE_ACCOUNT_KEY`, paste the **entire contents** of `~/finance-sa-key.json` (from step 2f) as a single-line JSON string. You can get the single-line version with:

```bash
cat ~/finance-sa-key.json | tr -d '\n'
```

### 9c. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard has three views:

- **Overview** — KPIs, monthly spending trend, category breakdown donut
- **Categories** — per-category drill-down into individual transactions
- **Budgets** — set and track monthly spending limits per category

### 9d. Production build

```bash
npm run build   # also runs TypeScript type checking
npm run lint    # ESLint
```

---

## 10. Prefect Orchestration

Prefect runs the full pipeline (ingestion → dbt) every 6 hours without any manual intervention.

### 10a. Authenticate with Prefect Cloud

Sign up at [app.prefect.io](https://app.prefect.io/) and create a workspace, then:

```bash
pip install prefect  # already in requirements.txt
prefect cloud login
```

Follow the browser prompt to authenticate.

### 10b. Create the `gcp-sa-key` Secret block

The Prefect flow loads GCP credentials at runtime from a Prefect Secret block named `gcp-sa-key`. In the Prefect Cloud UI:

1. Go to **Blocks → + Add Block → Secret**
2. Name it exactly `gcp-sa-key`
3. Paste the **full JSON contents** of `~/finance-sa-key.json` as the value
4. Save

### 10c. Create a work pool

```bash
prefect work-pool create my-pool --type process
```

Start a worker that executes scheduled runs:

```bash
prefect worker start --pool my-pool
```

Keep this running (in the background, via `screen`, `tmux`, or a system service).

### 10d. Deploy the flow

```bash
prefect deploy --all
```

This reads `prefect.yaml` and creates a deployment named `daily-finance-sync` scheduled to run at `0 */6 * * *` (every 6 hours). The deployment pulls the latest code from GitHub and installs `requirements.txt` on each run.

### 10e. Verify the deployment

In the Prefect Cloud UI, go to **Deployments**. You should see `daily-finance-sync`. You can trigger a manual run immediately to verify everything works end to end:

```bash
prefect deployment run 'daily_sync/daily-finance-sync'
```

Watch the logs in the UI or in the terminal running the worker.

---

## 11. Architecture Reference

### Data flow

```
Plaid webhook → ingestion/main.py (Cloud Function)
  → bronze.transactions (raw JSON)
  → dbt silver_transactions (parsed, deduplicated)
  → dbt gold_spending_by_category (monthly aggregates)
  → Next.js API routes
  → dashboard SPA
```

### Repository layout

```
ingestion/            Plaid webhook handler (Cloud Function)
  main.py             Core sync logic + webhook entrypoint
  set_webhook.py      One-off script to register webhook URL with Plaid
  populate_accounts.py  One-off script to backfill gold.accounts
dbt/                  dbt project (silver + gold models)
  models/silver/      silver_transactions.sql — parses bronze JSON
  models/gold/        gold_spending_by_category.sql — monthly aggregates
  macros/             generate_schema_name.sql — makes schema names literal
  profiles/           profiles.yml — BigQuery oauth via ADC
prefect/
  flow.py             Prefect flow (ingestion + dbt, every 6h)
prefect.yaml          Prefect deployment config + schedule
dashboard/            Next.js 16 / React 19 app
  app/api/            API routes (BigQuery queries)
  components/         UI components
  lib/                bigquery.ts, queries.ts, derive.ts, format.ts, types.ts
requirements.txt      Python deps (ingestion, dbt, Prefect)
```

### BigQuery schema

| Table | Columns |
|---|---|
| `bronze.transactions` | `raw_data` STRING, `ingested_at` TIMESTAMP |
| `silver.transactions` | `transaction_id`, `account_id`, `amount`, `transaction_date`, `pfc_primary`, `pfc_detailed`, `merchant_name`, `transaction_name`, … |
| `gold.spending_by_category` | `primary_category`, `detailed_category`, `total_spending`, `month`, `account_id` |
| `gold.budget_limits` | `primary_category`, `budget_limit`, `updated_at` |
| `gold.accounts` | `account_id`, `name`, `display_name`, `mask`, `type`, `subtype`, `item_id`, `updated_at` |

### Secret Manager secrets

| Secret name | Contents |
|---|---|
| `plaid-client-id` | Plaid Client ID |
| `plaid-secret` | Plaid Production secret key |
| `plaid-item-map` | JSON: `{ item_id → access_token_secret_name }` |
| `plaid-access-token-{institution}` | Plaid access token for one institution |
| `plaid-cursor-{item_id}` | Plaid sync cursor (auto-created by ingestion) |

### Environment variables

| Variable | Where | Value |
|---|---|---|
| `PROJECT_ID` | `ingestion/.env`, Cloud Function, dbt | Your GCP project ID |
| `GCP_PROJECT_ID` | `dashboard/.env.local` | Your GCP project ID |
| `GCP_SERVICE_ACCOUNT_KEY` | `dashboard/.env.local` | Full service account key JSON (one line) |
