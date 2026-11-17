import { bigquery } from '@/lib/bigquery'
import { isSpendingCategory } from '@/lib/categories'
import { EFFECTIVE_TRANSACTIONS, REBUILD_ADJUSTMENTS, timed } from '@/lib/queries'
import type { EventDetail, EventRecord, EventTransaction } from '@/lib/types'

// Events: named date windows whose purchases are scoped out of (or tracked beside) the
// normal totals. Membership lives in the gold.event_transactions dbt view; every write
// here rebuilds the adjustment ledger in the same BigQuery transaction.

const FAR_FUTURE = "DATE '9999-12-31'"

type ScriptParam = string | boolean | string[] | null | ReturnType<typeof bigquery.date>

function dateParam(value: string | null) {
    return value === null ? null : bigquery.date(value)
}

// Runs a multi-statement script and returns the row of its final SELECT (or null).
async function run_event_script(
    query: string,
    params: Record<string, ScriptParam>,
    types: Record<string, string | string[]>,
) {
    const rows = await timed('run_event_script', async () => {
        const [job] = await bigquery.createQueryJob({ query, location: 'US', params, types })
        const [r] = await job.getQueryResults()
        return r
    })
    return (rows[0] as Record<string, unknown> | undefined) ?? null
}

function iso(value: unknown): string | null {
    const raw = (value as { value?: unknown } | null)?.value ?? value
    return typeof raw === 'string' ? raw.slice(0, 10) : null
}

export interface EventRow {
    event_id: string
    name: string
    start_date: string
    end_date: string | null
    account_ids: string[]
    count_in_totals: boolean
}

function toEventRow(row: Record<string, unknown>): EventRow {
    return {
        event_id: row.event_id as string,
        name: row.name as string,
        start_date: iso(row.start_date) as string,
        end_date: iso(row.end_date),
        account_ids: (row.account_ids as string[] | null) ?? [],
        count_in_totals: row.count_in_totals === true,
    }
}

export async function get_event_row(event_id: string): Promise<EventRow | null> {
    try {
        const [job] = await bigquery.createQueryJob({
            query: `
                SELECT event_id, name, start_date, end_date, account_ids, count_in_totals
                FROM gold.events
                WHERE event_id = @event_id
            `,
            location: 'US',
            params: { event_id },
        })
        const [rows] = await job.getQueryResults()
        return rows[0] ? toEventRow(rows[0]) : null
    }
    catch (error: unknown) {
        console.error('BigQuery error:', error)
        throw error
    }
}

// Starts (or, with an end_date, backfills) an event. `clash` is the name of an existing
// event whose window overlaps; nothing is written in that case. Because the new window is
// open-ended when end_date is null, this also enforces one live event at a time.
export async function create_event(input: {
    name: string
    start_date: string
    end_date: string | null
    account_ids: string[]
    count_in_totals: boolean
    uid: string | null
}): Promise<{ created: true, event_id: string } | { created: false, clash: string }> {
    try {
        const event_id = crypto.randomUUID()
        const row = await run_event_script(`
            DECLARE clash_name STRING;
            SET clash_name = (
                SELECT ANY_VALUE(name) FROM gold.events
                WHERE start_date <= COALESCE(@end_date, ${FAR_FUTURE})
                    AND COALESCE(end_date, ${FAR_FUTURE}) >= @start_date
            );

            BEGIN TRANSACTION;
            INSERT INTO gold.events (event_id, name, start_date, end_date, account_ids, count_in_totals, created_at, created_by, ended_at)
            SELECT @event_id, @name, @start_date, @end_date, @account_ids, @count_in_totals,
                CURRENT_TIMESTAMP(), @uid, IF(@end_date IS NULL, CAST(NULL AS TIMESTAMP), CURRENT_TIMESTAMP())
            FROM (SELECT 1) WHERE clash_name IS NULL;
            ${REBUILD_ADJUSTMENTS}
            COMMIT TRANSACTION;

            SELECT clash_name AS clash;
        `, {
            event_id,
            name: input.name,
            start_date: dateParam(input.start_date),
            end_date: dateParam(input.end_date),
            account_ids: input.account_ids,
            count_in_totals: input.count_in_totals,
            uid: input.uid,
        }, {
            event_id: 'STRING',
            name: 'STRING',
            start_date: 'DATE',
            end_date: 'DATE',
            account_ids: ['STRING'],
            count_in_totals: 'BOOL',
            uid: 'STRING',
        })

        if (row) {
            const clash = (row.clash as string | null) ?? null
            return clash ? { created: false, clash } : { created: true, event_id }
        }
        // The script ran but its final SELECT didn't come back; check what was written.
        if (!(await get_event_row(event_id))) throw new Error('Event was not created')
        return { created: true, event_id }
    }
    catch (error: unknown) {
        console.error('BigQuery error:', error)
        throw error
    }
}

// Replaces an event's editable fields (the caller merges a patch onto the current row).
// Same overlap rule as create_event, ignoring the event itself.
export async function update_event(event_id: string, next: Omit<EventRow, 'event_id'>) {
    try {
        const row = await run_event_script(`
            DECLARE found BOOL DEFAULT (SELECT COUNT(*) > 0 FROM gold.events WHERE event_id = @event_id);
            DECLARE clash_name STRING;
            SET clash_name = (
                SELECT ANY_VALUE(name) FROM gold.events
                WHERE event_id != @event_id
                    AND start_date <= COALESCE(@end_date, ${FAR_FUTURE})
                    AND COALESCE(end_date, ${FAR_FUTURE}) >= @start_date
            );

            BEGIN TRANSACTION;
            UPDATE gold.events
            SET name = @name,
                start_date = @start_date,
                end_date = @end_date,
                account_ids = @account_ids,
                count_in_totals = @count_in_totals,
                ended_at = IF(@end_date IS NULL, CAST(NULL AS TIMESTAMP), COALESCE(ended_at, CURRENT_TIMESTAMP()))
            WHERE event_id = @event_id AND clash_name IS NULL;
            ${REBUILD_ADJUSTMENTS}
            COMMIT TRANSACTION;

            SELECT found AS found, clash_name AS clash;
        `, {
            event_id,
            name: next.name,
            start_date: dateParam(next.start_date),
            end_date: dateParam(next.end_date),
            account_ids: next.account_ids,
            count_in_totals: next.count_in_totals,
        }, {
            event_id: 'STRING',
            name: 'STRING',
            start_date: 'DATE',
            end_date: 'DATE',
            account_ids: ['STRING'],
            count_in_totals: 'BOOL',
        })

        if (!row) return { found: (await get_event_row(event_id)) !== null, clash: null as string | null }
        return { found: row.found === true, clash: (row.clash as string | null) ?? null }
    }
    catch (error: unknown) {
        console.error('BigQuery error:', error)
        throw error
    }
}

// Deletes an event and every override that points at it. Its transactions fall back into
// the normal totals.
export async function delete_event(event_id: string) {
    try {
        const row = await run_event_script(`
            DECLARE found BOOL DEFAULT (SELECT COUNT(*) > 0 FROM gold.events WHERE event_id = @event_id);

            BEGIN TRANSACTION;
            DELETE FROM gold.event_overrides WHERE event_id = @event_id;
            DELETE FROM gold.events WHERE event_id = @event_id;
            ${REBUILD_ADJUSTMENTS}
            COMMIT TRANSACTION;

            SELECT found AS found;
        `, { event_id }, { event_id: 'STRING' })

        return { found: row ? row.found === true : true }
    }
    catch (error: unknown) {
        console.error('BigQuery error:', error)
        throw error
    }
}

// Manually moves a transaction into an event ('include'), keeps it out of whatever event
// its date would put it in ('exclude'), or removes the manual override ('clear').
// Credit card payments can't be in an event.
export async function set_event_override(
    transaction_id: string,
    mode: 'include' | 'exclude' | 'clear',
    event_id: string | null,
    uid: string | null,
) {
    try {
        const statement = mode === 'clear'
            ? `DELETE FROM gold.event_overrides WHERE transaction_id = @transaction_id AND tx_found;`
            : `
                MERGE gold.event_overrides AS target
                USING (
                    SELECT @transaction_id AS transaction_id,
                        ${mode === 'include' ? '@event_id' : 'current_event'} AS event_id,
                        '${mode}' AS mode
                    FROM (SELECT 1)
                    WHERE tx_found AND ${mode === 'include' ? 'event_found' : 'current_event IS NOT NULL'}
                ) AS source
                ON target.transaction_id = source.transaction_id
                WHEN MATCHED THEN
                    UPDATE SET event_id = source.event_id, mode = source.mode, updated_at = CURRENT_TIMESTAMP(), updated_by = @uid
                WHEN NOT MATCHED THEN
                    INSERT (transaction_id, event_id, mode, updated_at, updated_by)
                    VALUES (source.transaction_id, source.event_id, source.mode, CURRENT_TIMESTAMP(), @uid);
            `

        const row = await run_event_script(`
            DECLARE tx_found BOOL;
            DECLARE current_event STRING;
            DECLARE event_found BOOL;
            SET tx_found = EXISTS (
                SELECT 1 FROM silver.transactions
                WHERE transaction_id = @transaction_id AND pfc_detailed != 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
            );
            SET current_event = (SELECT ANY_VALUE(event_id) FROM gold.event_transactions WHERE transaction_id = @transaction_id);
            SET event_found = EXISTS (SELECT 1 FROM gold.events WHERE event_id = @event_id);

            BEGIN TRANSACTION;
            ${statement}
            ${REBUILD_ADJUSTMENTS}
            COMMIT TRANSACTION;

            SELECT tx_found AS tx_found, event_found AS event_found, current_event IS NOT NULL AS in_event;
        `, { transaction_id, event_id, uid }, { transaction_id: 'STRING', event_id: 'STRING', uid: 'STRING' })

        if (!row) throw new Error('Override script returned no result')
        return {
            tx_found: row.tx_found === true,
            event_found: row.event_found === true,
            in_event: row.in_event === true,
        }
    }
    catch (error: unknown) {
        console.error('BigQuery error:', error)
        throw error
    }
}

// Every transaction that belongs to an event (optionally just one), with effective
// categories and ignored state.
function event_transactions_sql(onlyEvent: boolean) {
    return `
        SELECT
            et.event_id,
            et.is_override,
            t.transaction_id,
            t.transaction_name,
            t.merchant_name,
            t.amount,
            t.transaction_date,
            t.pfc_primary,
            t.pfc_detailed,
            t.original_pfc_primary,
            t.original_pfc_detailed,
            t.is_tagged,
            i.transaction_id IS NOT NULL AS is_ignored
        FROM gold.event_transactions AS et
        JOIN ${EFFECTIVE_TRANSACTIONS} AS t ON t.transaction_id = et.transaction_id
        LEFT JOIN gold.ignored_transactions AS i ON i.transaction_id = t.transaction_id
        ${onlyEvent ? 'WHERE et.event_id = @event_id' : ''}
        ORDER BY t.transaction_date DESC, t.transaction_id DESC
    `
}

// Spend that counts toward an event's total: not ignored, not income/transfers in.
function counts_toward_event(row: { is_ignored: boolean, pfc_primary: string | null }) {
    return !row.is_ignored && isSpendingCategory(row.pfc_primary)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function retrieve_events(): Promise<EventRecord[]> {
    try {
        const [[eventsJob], [txnsJob]] = await Promise.all([
            bigquery.createQueryJob({
                query: `
                    SELECT event_id, name, start_date, end_date, account_ids, count_in_totals
                    FROM gold.events
                    ORDER BY start_date DESC, event_id
                `,
                location: 'US',
            }),
            bigquery.createQueryJob({ query: event_transactions_sql(false), location: 'US' }),
        ])
        const [[eventRows], [txnRows]] = await Promise.all([eventsJob.getQueryResults(), txnsJob.getQueryResults()])

        const stats = new Map<string, { count: number, total: number }>()
        for (const t of txnRows) {
            const s = stats.get(t.event_id) ?? { count: 0, total: 0 }
            s.count += 1
            if (counts_toward_event(t)) s.total += Number(t.amount) || 0
            stats.set(t.event_id, s)
        }

        return eventRows.map((row) => {
            const base = toEventRow(row)
            const s = stats.get(base.event_id)
            return {
                ...base,
                live: base.end_date === null,
                transaction_count: s?.count ?? 0,
                total: round2(s?.total ?? 0),
            }
        })
    }
    catch (error: unknown) {
        console.error('BigQuery error: ', error)
        throw error
    }
}

export async function retrieve_event_detail(event_id: string): Promise<EventDetail | null> {
    try {
        const base = await get_event_row(event_id)
        if (!base) return null

        const [job] = await bigquery.createQueryJob({
            query: event_transactions_sql(true),
            location: 'US',
            params: { event_id },
        })
        const [rows] = await job.getQueryResults()

        const byCategory = new Map<string, number>()
        const byDay = new Map<string, number>()
        let total = 0
        for (const t of rows) {
            if (!counts_toward_event(t)) continue
            const amt = Number(t.amount) || 0
            total += amt
            const cat = t.pfc_primary ?? 'UNCATEGORIZED'
            byCategory.set(cat, (byCategory.get(cat) ?? 0) + amt)
            const day = iso(t.transaction_date)
            if (day) byDay.set(day, (byDay.get(day) ?? 0) + amt)
        }

        return {
            event: {
                ...base,
                live: base.end_date === null,
                transaction_count: rows.length,
                total: round2(total),
            },
            // Net per category; a category whose net isn't positive is dropped, like elsewhere.
            categories: [...byCategory.entries()]
                .filter(([, spent]) => spent > 0)
                .map(([category, spent]) => ({ category, spent: round2(spent) }))
                .sort((a, b) => b.spent - a.spent),
            daily: [...byDay.entries()]
                .map(([date, spent]) => ({ date, spent: round2(spent) }))
                .sort((a, b) => a.date.localeCompare(b.date)),
            transactions: rows as EventTransaction[],
        }
    }
    catch (error: unknown) {
        console.error('BigQuery error: ', error)
        throw error
    }
}
