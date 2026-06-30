{{ config(alias='spending_by_category') }}

SELECT
    pfc_primary AS primary_category,
    pfc_detailed AS detailed_category,
    SUM(amount) AS total_spending,
    DATE_TRUNC(transaction_date, MONTH) AS month,
    account_id AS account_id
FROM {{ ref('silver_transactions') }}
GROUP BY account_id, pfc_primary, pfc_detailed, DATE_TRUNC(transaction_date, MONTH)