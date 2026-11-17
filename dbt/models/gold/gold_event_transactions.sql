{{ config(alias='event_transactions', materialized='view') }}

{# Which event (if any) each transaction belongs to: at most one row per transaction_id.
   A view, so a live event picks up new transactions as soon as they reach silver, and so
   the dashboard ledger, the Prefect rebuild and the event queries share one definition.

   Membership:
     - an `include` override assigns the transaction to that event (ignoring dates/accounts)
     - an `exclude` override keeps it out of every event
     - otherwise it belongs to the event whose window contains its purchase date
       (authorized_date, falling back to transaction_date) and whose account scope matches
       (empty account_ids = all accounts). A live event (end_date NULL) is open-ended.
   Credit card payments never belong to an event. The pfc_detailed filter matches
   gold_spending_by_category.sql (including dropping NULLs) so the adjustment ledger stays
   consistent with gold. The dashboard API keeps event windows from overlapping; the
   QUALIFY is a backstop so a bad write can't fan out joins against this view. #}

WITH txns AS (
    SELECT
        transaction_id,
        account_id,
        COALESCE(authorized_date, transaction_date) AS purchase_date
    FROM {{ ref('silver_transactions') }}
    WHERE pfc_detailed != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
),

events AS (
    SELECT event_id, name, start_date, end_date, account_ids, count_in_totals
    FROM {{ source('gold', 'events') }}
),

overrides AS (
    SELECT transaction_id, event_id, mode
    FROM {{ source('gold', 'event_overrides') }}
),

by_window AS (
    SELECT t.transaction_id, e.event_id, FALSE AS is_override
    FROM txns AS t
    JOIN events AS e
        ON t.purchase_date >= e.start_date
        AND (e.end_date IS NULL OR t.purchase_date <= e.end_date)
        AND (COALESCE(ARRAY_LENGTH(e.account_ids), 0) = 0 OR t.account_id IN UNNEST(e.account_ids))
    WHERE NOT EXISTS (SELECT 1 FROM overrides AS o WHERE o.transaction_id = t.transaction_id)
),

by_override AS (
    SELECT t.transaction_id, o.event_id, TRUE AS is_override
    FROM txns AS t
    JOIN overrides AS o USING (transaction_id)
    WHERE o.mode = 'include'
)

SELECT
    m.transaction_id,
    m.event_id,
    e.name AS event_name,
    COALESCE(e.count_in_totals, FALSE) AS count_in_totals,
    m.is_override
FROM (
    SELECT * FROM by_window
    UNION ALL
    SELECT * FROM by_override
) AS m
JOIN events AS e ON e.event_id = m.event_id
QUALIFY ROW_NUMBER() OVER (PARTITION BY m.transaction_id ORDER BY m.is_override DESC, e.start_date DESC) = 1
