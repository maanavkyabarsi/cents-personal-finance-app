import { bigquery, projectId } from '@/lib/bigquery'

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
            FROM gold.spending_by_category AS s
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

export async function set_budget_limit(primary_category: string, budget_limit: number) {
    try {
        const query = `
            INSERT INTO gold.budget_limits (primary_category, budget_limit, updated_at)
            VALUES (@primary_category, @budget_limit, CURRENT_TIMESTAMP())
        `;

       const options = {
            query,
            location: 'US',
            params: { primary_category, budget_limit}
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);
        return {success: true}

    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function update_budget_limit(primary_category: string, budget_limit: number) {
    try {
        const query = `
            UPDATE gold.budget_limits
            SET budget_limit = @budget_limit, updated_at = CURRENT_TIMESTAMP()
            WHERE primary_category = @primary_category
        `;
    
       const options = {
            query,
            location: 'US',
            params: { primary_category, budget_limit}
        };

        const [job] = await bigquery.createQueryJob(options);
        console.log(`Job ${job.id} started.`);
        return {success: true}

    }

    catch (error: unknown) {
        console.error('BigQuery error:', error);
        throw error;
    }
}

export async function retrieve_transactions_primary_category_month(primary_category: string, month_year: string) {
    try {
        const query = `
            SELECT
                transaction_name,
                amount,
                transaction_date,
                pfc_primary
            FROM silver.transactions
            WHERE pfc_primary = @primary_category AND DATE_TRUNC(transaction_date, MONTH) = @month_year
        `;
    
       const options = {
            query,
            location: 'US',
            params: { primary_category, month_year}
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
                transaction_name,
                amount,
                transaction_date,
                pfc_detailed
            FROM silver.transactions
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
                transaction_name,
                amount,
                transaction_date,
                account_id
            FROM silver.transactions
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

// GET /api/spending/month — total spending this month from silver
export async function retrieve_total_spending_month(month_year: string) {
    try {
        const query = `
            SELECT
                SUM(amount) as total_amount_spent,
            FROM silver.transactions
            WHERE DATE_TRUNC(transaction_date, MONTH) = @month_year
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