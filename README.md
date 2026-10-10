# Cents: Personal Finance Pipeline — Setup Guide

An end-to-end pipeline that pulls your bank and card transactions from [Plaid](https://plaid.com/) into BigQuery, models them with dbt, and visualizes spending in a Next.js dashboard protected by Firebase (Google) sign-in. Ingestion and transformation run every 6 hours via Prefect.

```
Plaid webhook → Cloud Function → bronze.transactions (raw JSON)
  → dbt silver_transactions → dbt gold_spending_by_category
  → Next.js API routes → dashboard
```

Everything below uses placeholders (`YOUR_PROJECT_ID`, etc.). Substitute your own values.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Google Cloud Setup](#2-google-cloud-setup)
3. [Plaid Setup](#3-plaid-setup)
4. [Secret Manager — Store Your Credentials](#4-secret-manager--store-your-credentials)
5. [Ingestion — Local Setup](#5-ingestion--local-setup)
6. [dbt Setup](#6-dbt-setup)
7. [Deploy the Cloud Function](#7-deploy-the-cloud-function)
8. [Register the Webhook with Plaid](#8-register-the-webhook-with-plaid)
9. [Firebase Auth Setup](#9-firebase-auth-setup)
10. [Dashboard Setup](#10-dashboard-setup)
11. [Prefect Orchestration](#11-prefect-orchestration)
12. [Architecture Reference](#12-architecture-reference)

---

## 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.12+ | [python.org](https://www.python.org/downloads/) |
| Node.js | 22.12+ | [nodejs.org](https://nodejs.org/) |
| Google Cloud SDK (`gcloud`, `bq`) | latest | `brew install google-cloud-sdk` or [docs](https://cloud.google.com/sdk/docs/install) |
| dbt (BigQuery adapter) | any | installed via `requirements.txt` |
| Prefect | 3.x | installed via `requirements.txt` |

You also need a GitHub repository holding your copy of this code (Prefect clones it on every run — see step 11), and accounts with Plaid, Google Cloud, Firebase (same Google Cloud project works) and Prefect Cloud.

---

## 2. Google Cloud Setup

### 2a. Create a GCP project

```bash
gcloud projects create YOUR_PROJECT_ID --name="Finance Pipeline"
gcloud config set project YOUR_PROJECT_ID
```

Enable billing on the project in the [GCP Console](https://console.cloud.google.com/billing).

### 2b. Enable required APIs

```bash
gcloud services enable \
  bigquery.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com
```

### 2c. Create BigQuery datasets

Dataset names must be exactly `bronze`, `silver` and `gold` (see step 6). Use the `US` location — the code hardcodes it.

```bash
bq mk --location=US --dataset YOUR_PROJECT_ID:bronze
bq mk --location=US --dataset YOUR_PROJECT_ID:silver
bq mk --location=US --dataset YOUR_PROJECT_ID:gold
```

### 2d. Create the BigQuery tables you must create by hand

dbt creates `silver.*` and `gold.spending_by_category`, and ingestion creates `gold.accounts` automatically. These two you create yourself:

```bash
# Raw landing table written by the ingestion code
bq mk --table YOUR_PROJECT_ID:bronze.transactions \
  raw_data:STRING,ingested_at:TIMESTAMP

# Budget limits written by the dashboard's Budgets view
bq mk --table YOUR_PROJECT_ID:gold.budget_limits \
  primary_category:STRING,budget_limit:FLOAT,updated_at:TIMESTAMP
```

### 2e. Create a Firestore database

Plaid sync cursors (the "where did I leave off" pointer for each linked institution) are stored in Firestore, in a `plaid_cursors` collection keyed by Plaid item ID.

```bash
gcloud firestore databases create --location=nam5
```

(Any location works; pick one near you.) The default database in Native mode is what the code uses.

### 2f. Create a service account

Used by the Cloud Function, Prefect, and the dashboard's BigQuery queries.

```bash
gcloud iam service-accounts create finance-pipeline-sa \
  --display-name="Finance Pipeline Service Account"

SA="finance-pipeline-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com"

for ROLE in roles/bigquery.dataEditor roles/bigquery.jobUser \
            roles/secretmanager.secretAccessor roles/datastore.user; do
  gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:$SA" --role="$ROLE"
done
```

### 2g. Download a service account key

You need this key for Prefect (step 11) and the dashboard (step 10). Treat it as a secret and never commit it.

```bash
gcloud iam service-accounts keys create ~/finance-sa-key.json \
  --iam-account=finance-pipeline-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 2h. Set up Application Default Credentials locally

Lets dbt and the ingestion scripts authenticate when run on your machine:

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

---

## 3. Plaid Setup

### 3a. Create a Plaid account

Sign up at [plaid.com](https://plaid.com/). The code targets the **Production** environment (`plaid.Environment.Production`), which requires a brief approval from Plaid. (To use Sandbox instead, change the environment in `get_plaid_client()` in `ingestion/main.py` and in `ingestion/set_webhook.py`.)

### 3b. Get your Plaid credentials

In the [Plaid Dashboard](https://dashboard.plaid.com/) go to **Team Settings → Keys** and copy your **Client ID** and **Production Secret**.

### 3c. Link your bank accounts

Use [Plaid Link](https://plaid.com/docs/link/) to connect each institution. Each one gives you an **access token** and an **item ID**; keep both for the next step. Plaid's [Quickstart](https://github.com/plaid/quickstart) is the fastest way to get them.

---

## 4. Secret Manager — Store Your Credentials

Plaid credentials live in GCP Secret Manager. The ingestion code reads them at runtime; nothing sensitive goes in code.

### 4a. Plaid API credentials

```bash
echo -n "YOUR_PLAID_CLIENT_ID" | \
  gcloud secrets create plaid-client-id --data-file=- --project=YOUR_PROJECT_ID

echo -n "YOUR_PLAID_PRODUCTION_SECRET" | \
  gcloud secrets create plaid-secret --data-file=- --project=YOUR_PROJECT_ID
```

### 4b. One access-token secret per linked institution

Pick any descriptive name:

```bash
echo -n "access-production-XXXX-XXXX" | \
  gcloud secrets create plaid-access-token-INSTITUTION --data-file=- --project=YOUR_PROJECT_ID
```

### 4c. The item map

`plaid-item-map` is a JSON object mapping each Plaid `item_id` to the name of the secret that holds that item's access token. This is how ingestion finds the right token when a webhook fires, and how the Prefect flow knows which items to sync.

```bash
echo -n '{"ITEM_ID_1":"plaid-access-token-INSTITUTION_1","ITEM_ID_2":"plaid-access-token-INSTITUTION_2"}' | \
  gcloud secrets create plaid-item-map --data-file=- --project=YOUR_PROJECT_ID
```

When you link a new institution later, add its token secret and create a new version of `plaid-item-map` including it.

---

## 5. Ingestion — Local Setup

### 5a. Install Python deps

```bash
git clone YOUR_REPO_URL
cd personal-finance-pipeline

python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 5b. Create `ingestion/.env`

```bash
# ingestion/.env
PROJECT_ID=YOUR_PROJECT_ID
```

### 5c. Run the webhook handler locally

```bash
cd ingestion
functions-framework --target handle_webhook --port 8080
```

To receive real Plaid webhooks locally, expose port 8080 with [ngrok](https://ngrok.com/) and register that URL (step 8). The handler verifies Plaid's signed `Plaid-Verification` JWT on every request and returns 401 for anything else, so hand-crafted test requests (e.g. plain `curl`) will be rejected.

### 5d. Backfill and account scripts

With the venv active and `ingestion/.env` set, from `ingestion/`:

```bash
python main.py ITEM_ID        # sync one item now (a full backfill if it has no cursor yet)
python populate_accounts.py   # one-off: writes gold.accounts (display names for the dashboard)
```

---

## 6. dbt Setup

dbt reads `PROJECT_ID` from the environment and authenticates to BigQuery with Application Default Credentials (step 2h).

```bash
# From the repo root
export PROJECT_ID=YOUR_PROJECT_ID
dbt run --project-dir dbt --profiles-dir dbt/profiles
```

This creates the tables `silver.transactions` and `gold.spending_by_category` (the models are named `silver_transactions` and `gold_spending_by_category`, but each sets an `alias` so the table names drop the prefix).

Run a single model:

```bash
dbt run --select silver_transactions --project-dir dbt --profiles-dir dbt/profiles
```

Compile without running:

```bash
dbt compile --project-dir dbt --profiles-dir dbt/profiles
```

**Schema naming:** `dbt/macros/generate_schema_name.sql` overrides dbt's default so `+schema: silver` yields a dataset named exactly `silver`, not `<default>_silver`. That is why the datasets in step 2c must be named exactly `bronze`, `silver` and `gold`.

---

## 7. Deploy the Cloud Function

The ingestion handler runs as a 2nd-gen Cloud Function that Plaid calls when new transactions are available.

```bash
gcloud functions deploy handle-webhook \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=ingestion \
  --entry-point=handle_webhook \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=finance-pipeline-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars=PROJECT_ID=YOUR_PROJECT_ID \
  --project=YOUR_PROJECT_ID
```

Note the function URL from the output (`https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/handle-webhook` or the `run.app` URL).

> **Why `--allow-unauthenticated`?** Plaid calls the webhook from its own servers, so a GCP identity token can't be attached. Instead the handler implements [Plaid webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/): it checks the ES256 signature on the `Plaid-Verification` JWT against Plaid's published key, rejects tokens older than 5 minutes, and compares the token's `request_body_sha256` against the raw request body.

---

## 8. Register the Webhook with Plaid

`ingestion/set_webhook.py` points every item in `plaid-item-map` at your Cloud Function. From `ingestion/` with the venv active:

```bash
python set_webhook.py https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/handle-webhook
```

Re-run it whenever you link a new institution (after adding it to `plaid-item-map`). Afterwards Plaid POSTs `SYNC_UPDATES_AVAILABLE` to your function whenever new transactions exist; the handler syncs that item, appends rows to `bronze.transactions`, and stores the new cursor in Firestore.

---

## 9. Firebase Auth Setup

The dashboard is private: users sign in with Google via Firebase Auth, and every `/api/*` request must carry a Firebase ID token from an allow-listed user.

1. In the [Firebase Console](https://console.firebase.google.com/), **add Firebase to your existing GCP project** (`YOUR_PROJECT_ID`).
2. **Build → Authentication → Sign-in method**: enable **Google**.
3. **Authentication → Settings → Authorized domains**: add `localhost` (present by default) and your production domain if you deploy.
4. **Project settings → General → Your apps**: register a **Web app** and copy its config values (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, optional `measurementId`). These go into `dashboard/.env.local` (step 10).
5. Sign in once through the dashboard (step 10), then copy your user's **UID** from **Authentication → Users**. Put it in `ALLOWED_UIDS`. Users not on the list get a 403.

Sessions are capped at **1 hour** from the actual Google sign-in (not the last token refresh). The limit is enforced server-side in `dashboard/proxy.ts` using the token's `auth_time`; change `MAX_SESSION_SECONDS` in `dashboard/lib/session.ts` to adjust it.

---

## 10. Dashboard Setup

### 10a. Install dependencies

```bash
cd dashboard
npm install
```

### 10b. Create `dashboard/.env.local`

```bash
# BigQuery access (server-side only)
GCP_PROJECT_ID=YOUR_PROJECT_ID
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"YOUR_PROJECT_ID",...}

# Firebase web app config (from step 9)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...   # optional

# Comma-separated Firebase UIDs permitted to call the API
ALLOWED_UIDS=uid_one,uid_two
```

`GCP_SERVICE_ACCOUNT_KEY` is the entire contents of `~/finance-sa-key.json` as one line:

```bash
cat ~/finance-sa-key.json | tr -d '\n'
```

`NEXT_PUBLIC_FIREBASE_PROJECT_ID` must match the project users sign into; the server rejects tokens whose audience differs. Server-side token verification needs no service account credential.

### 10c. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google. If you see "unauthorized", your UID isn't in `ALLOWED_UIDS` yet (step 9, point 5) — add it and restart the dev server. Views:

- **Overview** — KPIs, monthly spending trend, category donut
- **Categories** — per-category drill-down into transactions
- **Budgets** — monthly spending limits per category (stored in `gold.budget_limits`)

### 10d. Production build

```bash
npm run build   # also type-checks
npm run lint
```

To deploy (e.g. to Vercel), set the same environment variables in the host's settings and add the production domain to Firebase's authorized domains.

---

## 11. Prefect Orchestration

Prefect runs the full pipeline every 6 hours: sync every Plaid item → refresh `gold.accounts` → `dbt run`.

### 11a. Point the deployment at your repo

`prefect.yaml` clones code from GitHub on each run. Edit the `git_clone` step so `repository:` is **your** repository URL (and `branch:` if not `main`). Because Prefect runs the pushed code, **push your changes before deploying or expecting them to take effect**. For a private repo, add credentials per [Prefect's docs](https://docs.prefect.io/v3/how-to-guides/deployments/store-flow-code).

### 11b. Authenticate with Prefect Cloud

Create a workspace at [app.prefect.io](https://app.prefect.io/), then:

```bash
prefect cloud login
```

### 11c. Create the `gcp-sa-key` Secret block

The flow loads GCP credentials from a Prefect Secret block named exactly `gcp-sa-key`. In the Prefect UI: **Blocks → + Add Block → Secret**, name it `gcp-sa-key`, paste the full JSON of `~/finance-sa-key.json` as the value, and save. The flow writes it to a temp file, sets `GOOGLE_APPLICATION_CREDENTIALS` and `PROJECT_ID` from it, and then runs ingestion and dbt.

### 11d. Create a work pool and start a worker

```bash
prefect work-pool create my-pool --type process
prefect worker start --pool my-pool
```

Keep the worker running (via `tmux`, `screen`, or a system service). If you name the pool differently, update `work_pool.name` in `prefect.yaml`.

### 11e. Deploy

```bash
prefect deploy --all
```

This creates `daily-finance-sync`, scheduled `0 */6 * * *`. Trigger a run to verify:

```bash
prefect deployment run 'daily_sync/daily-finance-sync'
```

You can also run the flow once locally without Prefect Cloud scheduling (it still needs the `gcp-sa-key` block): `python prefect/flow.py`.

---

## 12. Architecture Reference

### Repository layout

```
ingestion/            Plaid sync logic + Cloud Function webhook
  main.py             handle_webhook entrypoint, transactions_sync, write_to_bronze, sync_accounts
  set_webhook.py      One-off: register webhook URL on every item in plaid-item-map
  populate_accounts.py  One-off: write gold.accounts
dbt/                  dbt project (silver + gold models)
  macros/generate_schema_name.sql  makes schema names literal
  profiles/profiles.yml            BigQuery oauth via ADC
prefect/flow.py       Prefect flow (ingestion + accounts + dbt)
prefect.yaml          Deployment config + schedule
dashboard/            Next.js app (React, Firebase Auth)
  proxy.ts            Guards /api/*: verifies ID token, session age, UID allowlist
  app/api/            API routes → lib/queries.ts → BigQuery
  lib/                bigquery, queries, derive, categories, authFetch, session, firebase(Admin)
  components/         UI
requirements.txt      Python deps (ingestion, dbt, Prefect)
```

The Prefect flow imports `ingestion/main.py` directly (adding `ingestion/` to `sys.path`) rather than calling the deployed function.

### BigQuery schema

| Table | Created by | Columns |
|---|---|---|
| `bronze.transactions` | you (step 2d) | `raw_data` STRING (Plaid JSON), `ingested_at` TIMESTAMP. Removed transactions are stored as `{"transaction_id": ..., "removed": true}` |
| `silver.transactions` | dbt | parsed + deduplicated: `transaction_id`, `account_id`, `amount`, `transaction_date`, `pfc_primary`, `pfc_detailed`, `merchant_name`, `transaction_name`, … |
| `gold.spending_by_category` | dbt | `primary_category`, `detailed_category`, `total_spending`, `month`, `account_id` |
| `gold.budget_limits` | you (step 2d); written by dashboard | `primary_category`, `budget_limit`, `updated_at` |
| `gold.accounts` | ingestion (`sync_accounts`, truncated and reloaded each run) | `account_id`, `name`, `official_name`, `display_name`, `mask`, `type`, `subtype`, `item_id`, `updated_at` |

### Secret Manager secrets

| Secret name | Contents |
|---|---|
| `plaid-client-id` | Plaid Client ID |
| `plaid-secret` | Plaid Production secret |
| `plaid-item-map` | JSON: `{ item_id → access-token secret name }` |
| `plaid-access-token-*` | One Plaid access token per institution |

### Firestore

| Collection | Document ID | Fields |
|---|---|---|
| `plaid_cursors` | Plaid `item_id` | `cursor`, `updated_at` |

### Environment variables

| Variable | Where | Value |
|---|---|---|
| `PROJECT_ID` | `ingestion/.env`, Cloud Function, dbt shell | GCP project ID |
| `GCP_PROJECT_ID` | `dashboard/.env.local` | GCP project ID |
| `GCP_SERVICE_ACCOUNT_KEY` | `dashboard/.env.local` | Service account key JSON, one line |
| `NEXT_PUBLIC_FIREBASE_*` | `dashboard/.env.local` | Firebase web app config |
| `ALLOWED_UIDS` | `dashboard/.env.local` | Comma-separated Firebase UIDs |

### Troubleshooting

- **401 "Failed to verify authorization token"** — `NEXT_PUBLIC_FIREBASE_PROJECT_ID` doesn't match the project you signed into.
- **401 "Session expired"** — the hour elapsed; sign in again.
- **403 "Unauthorized user detected"** — your UID isn't in `ALLOWED_UIDS`.
- **dbt can't find a dataset** — datasets must be named exactly `bronze`, `silver`, `gold`, in the `US` location.
- **Ingestion re-pulls everything** — the item has no Firestore cursor yet (first run) or the SA lacks `roles/datastore.user`.
