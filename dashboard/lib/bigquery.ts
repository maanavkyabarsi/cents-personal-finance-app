import { BigQuery } from "@google-cloud/bigquery";

const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY!);

export const projectId = process.env.GCP_PROJECT_ID!

export const bigquery = new BigQuery ({
    projectId,
    credentials,
});
