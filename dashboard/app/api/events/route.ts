import { NextRequest, NextResponse } from "next/server";
import { create_event, retrieve_events } from "@/lib/events";
import { retrieve_accounts } from "@/lib/queries";
import { isIsoDate, parseAccountIds, parseName, todayIso } from "@/lib/eventInput";

export async function GET() {
    try {
        const events = await retrieve_events()
        return NextResponse.json(events)
    }
    catch {
        return NextResponse.json(
            { error: 'Failed to get events' },
            { status: 500 }
        )
    }
}

// Starts an event. With no end_date it is live (and only one live event may exist); pass
// an end_date to log a past event. start_date defaults to today (UTC).
export async function POST(request: NextRequest) {
    let payload: Record<string, unknown> | null = null
    try {
        payload = await request.json()
    }
    catch {
        payload = null
    }
    if (!payload || typeof payload !== 'object') {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const name = parseName(payload.name)
    if (!name) {
        return NextResponse.json({ error: 'name is required (1-60 characters)' }, { status: 400 })
    }

    const start_date = payload.start_date === undefined ? todayIso() : payload.start_date
    if (!isIsoDate(start_date)) {
        return NextResponse.json({ error: 'start_date must be YYYY-MM-DD' }, { status: 400 })
    }

    const end_date = payload.end_date === undefined || payload.end_date === null ? null : payload.end_date
    if (end_date !== null && !isIsoDate(end_date)) {
        return NextResponse.json({ error: 'end_date must be YYYY-MM-DD' }, { status: 400 })
    }
    if (end_date !== null && end_date < start_date) {
        return NextResponse.json({ error: 'end_date cannot be before start_date' }, { status: 400 })
    }

    const account_ids = payload.account_ids === undefined ? [] : parseAccountIds(payload.account_ids)
    if (account_ids === null) {
        return NextResponse.json({ error: 'account_ids must be an array of account ids' }, { status: 400 })
    }

    if (typeof payload.count_in_totals !== 'boolean') {
        return NextResponse.json({ error: 'count_in_totals must be true or false' }, { status: 400 })
    }

    try {
        if (account_ids.length > 0) {
            const known = new Set((await retrieve_accounts()).map((a) => a.account_id))
            const unknown = account_ids.filter((id) => !known.has(id))
            if (unknown.length > 0) {
                return NextResponse.json({ error: 'Unknown account_ids', unknown }, { status: 400 })
            }
        }

        const result = await create_event({
            name,
            start_date,
            end_date,
            account_ids,
            count_in_totals: payload.count_in_totals,
            uid: request.headers.get('x-user-id'),
        })
        if (!result.created) {
            return NextResponse.json(
                { error: `Overlaps with the event "${result.clash}"` },
                { status: 409 }
            )
        }
        return NextResponse.json({ event_id: result.event_id, message: `Started event ${name}` }, { status: 201 })
    }
    catch {
        return NextResponse.json(
            { error: 'Failed to start event' },
            { status: 500 }
        )
    }
}
