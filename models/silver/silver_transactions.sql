{{ config(alias='transactions') }}

SELECT
    JSON_VALUE(raw_data, '$.transaction_id') AS transaction_id,
    JSON_VALUE(raw_data, '$.account_id') AS account_id,
    CAST(JSON_VALUE(raw_data, '$.amount') AS FLOAT64) AS amount,
    CAST(JSON_VALUE(raw_data, '$.date') AS DATE) AS transaction_date,
    JSON_VALUE(raw_data, '$.category') AS category,
    JSON_VALUE(raw_data, '$.category_id') AS category_id,
    JSON_VALUE(raw_data, '$.counterparties[0].name') AS counterparties_name,
    JSON_VALUE(raw_data, '$.counterparties[0].type') AS counterparties_type,
    JSON_VALUE(raw_data, '$.merchant_name') AS merchant_name,
    JSON_VALUE(raw_data, '$.name') AS transaction_name,
    JSON_VALUE(raw_data, '$.payment_channel') AS payment_channel,
    JSON_VALUE(raw_data, '$.pending') AS pending,
    JSON_VALUE(raw_data, '$.personal_finance_category.primary') AS pfc_primary,
JSON_VALUE(raw_data, '$.personal_finance_category.detailed') AS pfc_detailed
FROM {{ source('bronze', 'transactions') }}
QUALIFY ROW_NUMBER() OVER (PARTITION BY JSON_VALUE(raw_data, '$.transaction_id') ORDER BY ingested_at DESC) = 1