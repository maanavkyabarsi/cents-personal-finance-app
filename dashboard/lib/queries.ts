import { bigquery, projectId } from '@/lib/bigquery'
import { isSpendingCategory } from '@/lib/categories'
import { budgetStatus, monthProgress } from '@/lib/derive'

export const OVERALL_CATEGORY = '__OVERALL__'

// gold.spending_by_category plus the signed adjustment ledger. Use in place of the gold
// table anywhere totals are read so ignored and manually tagged transactions shift
// totals immediately. adjustment is an amount to subtract (negative = amount to add).
// UNION ALL + GROUP BY (rather than a join) because a tag can add spending to a key
// that has no gold row.
const ADJUSTED_SPENDING = `(
    SELECT
        account_id,
        primary_category,
        detailed_category,
        month,
        ROUND(SUM(total_spending), 2) AS total_spending
    FROM (
        SELECT account_id, primary_category, detailed_category, month, total_spending
        FROM gold.spending_by_category
        UNION ALL
        SELECT account_id, primary_category, detailed_category, month, -adjustment AS total_spending
        FROM gold.spending_adjustments
    )
    GROUP BY account_id, primary_category, detailed_category, month
)`

// silver.transactions with manual category tags applied. pfc_primary is the effective
// category; a tagged transaction has no detailed category. The original primary category
// is kept in original_pfc_primary. Alias it (AS t) where used.
const EFFECTIVE_TRANSACTIONS = `(
    SELECT
        t.* EXCEPT (pfc_primary, pfc_detailed),
        COALESCE(c.primary_category, t.pfc_primary) AS pfc_primary,
        IF(c.transaction_id IS NULL, t.pfc_detailed, NULL) AS pfc_detailed,
        t.pfc_primary AS original_pfc_primary,
        c.transaction_id IS NOT NULL AS is_tagged
    FROM silver.transactions AS t
    LEFT JOIN gold.transaction_categories AS c USING (transaction_id)
)`

// The full set of rows for gold.spending_adjustments, derived from silver, the ignored
// list and the tag table:
//  - remove side: every ignored or tagged transaction is subtracted at its ORIGINAL key
//  - add side: every tagged, non-ignored transaction is added at (tagged category, no
//    detailed category), expressed as a negative adjustment
// The pfc_detailed filter must match dbt/models/gold/gold_spending_by_category.sql
// exactly (including dropping NULLs), as must the rebuild in prefect/flow.py.
const ADJUSTMENT_ROWS_SQL = `
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
    GROUP BY account_id, primary_category, detailed_category, month
`

// Rebuilds the whole ledger (the tables are tiny). Runs inside the same BigQuery
// transaction as the ignore/tag write so the two can't drift apart.
const REBUILD_ADJUSTMENTS = `
    DELETE FROM gold.spending_adjustments WHERE TRUE;

    INSERT INTO gold.spending_adjustments (account_id, primary_category, detailed_category, month, adjustment)
    ${ADJUSTMENT_ROWS_SQL};
`

// Looks up a transaction in silver, server-side, so the client only ever sends an ID.
// Returns null if the transaction isn't in silver.
async function lookup_transaction(transaction_id: string) {
    const query = `
        SELECT pfc_detailed
        FROM silver.transactions
        WHERE transaction_id = @transaction_id
        LIMIT 1
    `;

    const options = {
        query,
        location: 'US',
        params: { transaction_id },
    };

    const [job] = await bigquery.createQueryJob(options);
    console.log(`Job ${job.id} started.`);

    const [rows] = await job.getQueryResults();
    if (rows.length === 0) return null;

    return { pfc_detailed: rows[0].pfc_detailed as string | null }
}

// Runs a write plus the adjustment rebuild as one BigQuery transaction.
async function run_with_adjustment_rebuild(
    statement: string,
    params: Record<string, string | null>,
) {
    const query = `
        BEGIN TRANSACTION;
        ${statement}
        ${REBUILD_ADJUSTMENTS}
        COMMIT TRANSACTION;
    `;

    const types = Object.fromEntries(Object.keys(params).map((k) => [k, 'STRING']));

    const [job] = await bigquery.createQueryJob({
        query,
        location: 'US',
        params,
        types,
    });
    console.log(`Job ${job.id} started.`);
    await job.getQueryResults();
}

async function set_transaction_ignored(transaction_id: string, ignored: boolean, uid: string | null) {
    try {
        const txn = await lookup_transaction(transaction_id)
        if (!txn) return { found: false }

        const toggle = ignored
            ? `
                INSERT INTO gold.ignored_transactions (transaction_id, ignored_at, ignored_by)
                SELECT @transaction_id, CURRENT_TIMESTAMP(), @uid
                FROM (SELECT 1)
                WHERE NOT EXISTS (
                    SELECT 1 FROM gold.ignored_transactions WHERE transaction_id = @transaction_id
                );
            `
            : `
                DELETE FROM gold.ignored_transactions WHERE transaction_id = @transaction_id;
            `;

        await run_with_adjustment_rebuild(toggle, { transaction_id, uid })
        return { found: true }
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function ignore_transaction(transaction_id: string, uid: string | null) {
    return set_transaction_ignored(transaction_id, true, uid)
}

export async function unignore_transaction(transaction_id: string) {
    return set_transaction_ignored(transaction_id, false, null)
}

// Tags a transaction with a primary category (or clears the tag when primary_category is
// null). Credit card payments are excluded from gold and every list, so they can't be tagged.
export async function set_transaction_category(transaction_id: string, primary_category: string | null, uid: string | null) {
    try {
        const txn = await lookup_transaction(transaction_id)
        if (!txn) return { found: false, taggable: false }
        if (txn.pfc_detailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT') return { found: true, taggable: false }

        const statement = primary_category !== null
            ? `
                MERGE gold.transaction_categories AS target
                USING (SELECT @transaction_id AS transaction_id) AS source
                ON target.transaction_id = source.transaction_id
                WHEN MATCHED THEN
                    UPDATE SET primary_category = @primary_category, tagged_at = CURRENT_TIMESTAMP(), tagged_by = @uid
                WHEN NOT MATCHED THEN
                    INSERT (transaction_id, primary_category, tagged_at, tagged_by)
                    VALUES (@transaction_id, @primary_category, CURRENT_TIMESTAMP(), @uid);
            `
            : `
                DELETE FROM gold.transaction_categories WHERE transaction_id = @transaction_id;
            `;

        const params: Record<string, string | null> = primary_category !== null
            ? { transaction_id, primary_category, uid }
            : { transaction_id };

        await run_with_adjustment_rebuild(statement, params)
        return { found: true, taggable: true }
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function retrieve_accounts() {
    try {
        const query = `
            SELECT account_id, display_name, mask, type, subtype
            FROM gold.accounts
            ORDER BY display_name
        `;

        const options = {
            query,
            location: 'US',
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);

        const [rows] = await job.getQueryResults();
        return rows
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function gold_spending_by_category() {
    try {
        const query = `
            SELECT
                s.primary_category,
                s.detailed_category,
                s.total_spending,
                s.month,
                s.account_id,
                b.budget_limit,
                b.updated_at AS budget_updated_at
            FROM ${ADJUSTED_SPENDING} AS s
            LEFT JOIN gold.budget_limits AS b
            ON s.primary_category = b.primary_category
        `;

        const options = {
            query,
            location: 'US',
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);

        const [rows] = await job.getQueryResults();
        return rows
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function upsert_budget_limit(primary_category: string, budget_limit: number) {
    try {
        const query = `
            MERGE gold.budget_limits AS target
            USING (SELECT @primary_category AS primary_category) AS source
            ON target.primary_category = source.primary_category
            WHEN MATCHED THEN
                UPDATE SET budget_limit = @budget_limit, updated_at = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN
                INSERT (primary_category, budget_limit, updated_at)
                VALUES (@primary_category, @budget_limit, CURRENT_TIMESTAMP())
        `;

        const options = {
            query,
            location: 'US',
            params: { primary_category, budget_limit }
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);
        await job.getQueryResults();
        return { success: true }

    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function retrieve_overall_budget() {
    try {
        const query = `
            SELECT budget_limit
            FROM gold.budget_limits
            WHERE primary_category = @primary_category
            ORDER BY updated_at DESC
            LIMIT 1
        `;

        const options = {
            query,
            location: 'US',
            params: { primary_category: OVERALL_CATEGORY }
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);

        const [rows] = await job.getQueryResults();
        return rows
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}


export async function retrieve_transactions_primary_category_month(primary_category: string, month_year: string, account_id?: string | null) {
    try {
        const params: Record<string, string> = { primary_category, month_year }
        let accountFilter = ''
        if (account_id) {
            params.account_id = account_id
            accountFilter = 'AND account_id = @account_id'
        }

        const query = `
            SELECT
                transaction_id,
                transaction_name,
                amount,
                transaction_date,
                pfc_primary,
                original_pfc_primary,
                is_tagged,
                i.transaction_id IS NOT NULL AS is_ignored
            FROM ${EFFECTIVE_TRANSACTIONS} AS t
            LEFT JOIN gold.ignored_transactions AS i USING (transaction_id)
            WHERE pfc_primary = @primary_category AND DATE_TRUNC(transaction_date, MONTH) = @month_year AND COALESCE(pfc_detailed, '') != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
              ${accountFilter}
        `;

        const options = {
            query,
            location: 'US',
            params
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);
        
        const [rows] = await job.getQueryResults();
        return rows
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function retrieve_recent_transactions(month_year: string, account_id?: string | null) {
    try {
        const params: Record<string, string> = { month_year }
        let accountFilter = ''
        if (account_id) {
            params.account_id = account_id
            accountFilter = 'AND account_id = @account_id'
        }

        const query = `
            SELECT
                transaction_id,
                transaction_name,
                merchant_name,
                amount,
                transaction_date,
                pfc_primary,
                original_pfc_primary,
                is_tagged,
                i.transaction_id IS NOT NULL AS is_ignored
            FROM ${EFFECTIVE_TRANSACTIONS} AS t
            LEFT JOIN gold.ignored_transactions AS i USING (transaction_id)
            WHERE DATE_TRUNC(transaction_date, MONTH) = @month_year
              AND COALESCE(pfc_detailed, '') != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
              ${accountFilter}
            ORDER BY transaction_date DESC, transaction_id DESC
            LIMIT 8
        `;

        const options = {
            query,
            location: 'US',
            params
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);

        const [rows] = await job.getQueryResults();
        return rows
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function retrieve_transactions_detailed_category_month(detailed_category: string, month_year: string) {
    try {
        const query = `
            SELECT
                transaction_id,
                transaction_name,
                amount,
                transaction_date,
                pfc_detailed,
                i.transaction_id IS NOT NULL AS is_ignored
            FROM silver.transactions
            LEFT JOIN gold.ignored_transactions AS i USING (transaction_id)
            WHERE pfc_detailed = @detailed_category AND DATE_TRUNC(transaction_date, MONTH) = @month_year
        `;

        const options = {
            query,
            location: 'US',
            params: { detailed_category, month_year}
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);
        
        const [rows] = await job.getQueryResults();
        return rows
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function retrieve_transactions_account(account_id: string) {
    try {
        const query = `
            SELECT
                transaction_id,
                transaction_name,
                amount,
                transaction_date,
                account_id,
                pfc_primary,
                original_pfc_primary,
                is_tagged,
                i.transaction_id IS NOT NULL AS is_ignored
            FROM ${EFFECTIVE_TRANSACTIONS} AS t
            LEFT JOIN gold.ignored_transactions AS i USING (transaction_id)
            WHERE account_id = @account_id
        `;
        
        const options = {
            query,
            location: 'US',
            params: { account_id }
        };

        const [job] = await bigquery.createQueryJob(options)
        console.log(`Job ${job.id} started.`)

        const [rows] = await job.getQueryResults()
        return rows
    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function retrieve_total_spending_month(month_year: string) {
    try {
        const query = `
            SELECT
                SUM(amount) as total_amount_spent,
            FROM silver.transactions AS t
            WHERE DATE_TRUNC(transaction_date, MONTH) = @month_year
                AND NOT EXISTS (SELECT 1 FROM gold.ignored_transactions AS i WHERE i.transaction_id = t.transaction_id)
        `;

        const options = {
            query,
            location: 'US',
            params: { month_year }
        };

        const [job] = await bigquery.createQueryJob(options)
        console.log(`Job ${job.id} started.`)

        const [rows] = await job.getQueryResults()
        return rows
    }

    catch (error: unknown) {
        console.error('BigQuery error: ', error)
        throw error;
    } 
}

export async function retrieve_primary_categories() {
    try {
        const query = `
            SELECT DISTINCT t.pfc_primary AS category, b.budget_limit AS \`limit\`
            FROM ${EFFECTIVE_TRANSACTIONS} t
            LEFT JOIN gold.budget_limits b
                ON t.pfc_primary = b.primary_category
        `;

        const options = {
            query,
            location: 'US',
        };

        const [job] = await bigquery.createQueryJob(options)
        console.log(`Job ${job.id} started.`)

        const [rows] = await job.getQueryResults()
        return rows.filter((row) => isSpendingCategory(row.category))
    }

    catch (error: unknown) {
        console.error('BigQuery error: ', error)
        throw error;
    }

}

export async function retrieve_available_months() {
    try {
        const query = `
            SELECT DISTINCT month
            FROM gold.spending_by_category
            ORDER BY month
        `;

        const options = {
            query,
            location: 'US',
        };

        const [job] = await bigquery.createQueryJob(options)
        console.log(`Job ${job.id} started.`)

        const [rows] = await job.getQueryResults()
        const months = new Set<string>();
        for (const row of rows) {
            const raw = row.month?.value ?? row.month;
            if (typeof raw === 'string') months.add(raw.slice(0, 7));
        }
        return [...months].sort()
    }

    catch (error: unknown) {
        console.error('BigQuery error: ', error)
        throw error;
    }
}

export async function retrieve_category_summaries(month_year: string, account_id?: string | null) {
    try {
        const params: Record<string, string> = { month_year }
        let accountFilter = ''
        if (account_id) {
            params.account_id = account_id
            accountFilter = 'AND s.account_id = @account_id'
        }

        const query = `
            SELECT
                s.primary_category,
                s.detailed_category,
                s.total_spending,
                b.budget_limit
            FROM ${ADJUSTED_SPENDING} AS s
            LEFT JOIN gold.budget_limits AS b
                ON s.primary_category = b.primary_category
            WHERE DATE_TRUNC(s.month, MONTH) = @month_year
                ${accountFilter}
        `;

        const options = {
            query,
            location: 'US',
            params,
        };

        const [job] = await bigquery.createQueryJob(options)
        console.log(`Job ${job.id} started.`)

        const [rows] = await job.getQueryResults()

        const map = new Map<string, {
            category: string;
            spent: number;
            budget: number | null;
            detailed: { name: string; spent: number }[];
        }>();

        for (const row of rows) {
            if (!isSpendingCategory(row.primary_category)) continue;
            const amt = Number(row.total_spending) || 0;

            const cat = row.primary_category ?? 'UNCATEGORIZED';
            let entry = map.get(cat);
            if (!entry) {
                entry = { category: cat, spent: 0, budget: null, detailed: [] };
                map.set(cat, entry);
            }
            // Net across rows (a tagged reimbursement offsets spend in the same category);
            // categories whose net isn't positive are dropped below.
            entry.spent += amt;

            const limit = Number(row.budget_limit) || 0;
            if (row.budget_limit !== null && limit > 0) entry.budget = limit;

            if (amt > 0 && row.detailed_category) {
                const existing = entry.detailed.find((d) => d.name === row.detailed_category);
                if (existing) existing.spent += amt;
                else entry.detailed.push({ name: row.detailed_category, spent: amt });
            }
        }

        const summaries = [...map.values()].filter((entry) => entry.spent > 0).map((entry) => ({
            ...entry,
            status: budgetStatus(entry.spent, entry.budget),
        }));
        for (const s of summaries) s.detailed.sort((a, b) => b.spent - a.spent);
        return summaries.sort((a, b) => b.spent - a.spent)
    }

    catch (error: unknown) {
        console.error('BigQuery error: ', error)
        throw error;
    }
}

export async function retrieve_dashboard_overview(month_year: string, account_id?: string | null) {
    try {
        const [y, m] = month_year.split('-').map(Number)
        const prevDate = new Date(y, m - 2, 1)
        const prev_month_year = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`
        const prevMonthKey = prev_month_year.slice(0, 7)

        const params: Record<string, string> = { month_year, prev_month_year }
        let accountFilter = ''
        if (account_id) {
            params.account_id = account_id
            accountFilter = 'AND account_id = @account_id'
        }

        const query = `
            SELECT primary_category, total_spending, month
            FROM ${ADJUSTED_SPENDING}
            WHERE DATE_TRUNC(month, MONTH) IN (@month_year, @prev_month_year)
                ${accountFilter}
        `;

        const options = {
            query,
            location: 'US',
            params,
        };

        const [job] = await bigquery.createQueryJob(options)
        console.log(`Job ${job.id} started.`)

        const [rows] = await job.getQueryResults()

        // Net per (category, month) first so a tagged reimbursement offsets spend in the
        // same category, then count only categories whose net is positive.
        const net = new Map<string, number>()
        for (const row of rows) {
            if (!isSpendingCategory(row.primary_category)) continue;
            const amt = Number(row.total_spending) || 0;
            const raw = row.month?.value ?? row.month;
            const key = typeof raw === 'string' ? raw.slice(0, 7) : null;
            if (key === null) continue;
            const k = `${row.primary_category ?? ''}|${key}`
            net.set(k, (net.get(k) ?? 0) + amt)
        }

        let totalSpent = 0
        let prevSpent = 0
        for (const [k, amt] of net) {
            if (amt <= 0) continue;
            const key = k.slice(k.lastIndexOf('|') + 1)
            if (key === month_year.slice(0, 7)) totalSpent += amt;
            else if (key === prevMonthKey) prevSpent += amt;
        }

        const overallRows = await retrieve_overall_budget()
        const budgetLimit = overallRows[0] ? Number(overallRows[0].budget_limit) || 0 : 0
        const hasBudget = budgetLimit > 0

        const momDeltaPct = prevSpent > 0 ? ((totalSpent - prevSpent) / prevSpent) * 100 : null

        const { daysElapsed, daysLeft, inMonth } = monthProgress(month_year.slice(0, 7))
        const dailyPace = daysElapsed > 0 ? totalSpent / daysElapsed : totalSpent
        const usedRatio = hasBudget ? totalSpent / budgetLimit : 0

        return {
            totalSpent,
            budget: hasBudget ? budgetLimit : null,
            remaining: hasBudget ? budgetLimit - totalSpent : null,
            momDeltaPct,
            prevMonthKey: prevSpent > 0 ? prevMonthKey : null,
            dailyPace,
            usedRatio,
            status: budgetStatus(totalSpent, hasBudget ? budgetLimit : null),
            daysElapsed,
            daysLeft,
            inMonth,
        }
    }

    catch (error: unknown) {
        console.error('BigQuery error: ', error)
        throw error;
    }
}

export async function retrieve_spending_trends(grain: string, start_date: string | null, account_id: string | null, primary_category: string | null, detailed_category: string | null) {
    try {
        const query = `
            SELECT
                DATE_TRUNC(transaction_date, ${grain}) AS period,
                SUM(amount) AS total
            FROM ${EFFECTIVE_TRANSACTIONS} AS t
            WHERE
                (transaction_date >= @start_date OR @start_date IS NULL)
                AND (@account_id = account_id OR @account_id IS NULL)
                AND (@primary_category = pfc_primary OR @primary_category IS NULL)
                AND (@detailed_category = pfc_detailed OR @detailed_category IS NULL)
                AND pfc_primary NOT IN ('INCOME', 'TRANSFER_IN')
                AND NOT EXISTS (SELECT 1 FROM gold.ignored_transactions AS i WHERE i.transaction_id = t.transaction_id)
            GROUP BY period
            ORDER BY period
        `;

        const options = {
            query,
            location: 'US',
            params: { start_date: start_date !== null ? bigquery.date(start_date) : null , account_id , primary_category, detailed_category},
            types: { start_date: 'DATE' , account_id: 'STRING', primary_category: 'STRING', detailed_category: 'STRING'},
        }

        const [job] = await bigquery.createQueryJob(options)
        console.log(`Job ${job.id} started.`)

        const [rows] = await job.getQueryResults()
        const total_spending = rows.reduce((sum, row) => sum + row.total, 0);
        
        if (start_date == null) {
            try {
                const query = `
                    SELECT MIN(transaction_date) AS earliest_date
                    FROM silver.transactions
                `;

                const options = {
                    query,
                    location: 'US',
                };

                const [job] = await bigquery.createQueryJob(options)
                console.log(`Job ${job.id} started.`)

                const [rows] = await job.getQueryResults()
                
                var [{ earliest_date: arithmetic_start_date }] = rows
                arithmetic_start_date = new Date(arithmetic_start_date.value)

            }

            catch (error: unknown) {
                console.error('BigQuery error: ', error)
                throw error;
            } 

        }
        else {
            arithmetic_start_date = new Date(start_date)
        }
        const current_date = new Date()

        const days = (current_date.getTime() - arithmetic_start_date.getTime()) / (1000 * 60 * 60 * 24)

        const avg_daily_spend = total_spending / days
        
        return { rows, total_spending, avg_daily_spend }

    }

    catch (error: unknown) {
        console.error('BigQuery error: ', error)
        throw error;
    } 
        
}