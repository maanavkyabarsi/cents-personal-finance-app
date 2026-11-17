import { NextRequest, NextResponse } from "next/server";
import { delete_event, get_event_row, retrieve_event_detail, update_event } from "@/lib/events";
import { retrieve_accounts } from "@/lib/queries";
import { isIsoDate, parseAccountIds, parseName, todayIso } from "@/lib/eventInput";

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
    const { id } = await params
    try {
        const detail = await retrieve_event_detail(id)
        if (!detail) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }
        return NextResponse.json(detail)
    }
    catch {
        return NextResponse.json(
            { error: 'Failed to get event' },
            { status: 500 }
        )
    }
}

// Partial update. Fields: name, start_date, end_date (null reopens the event), account_ids,
// count_in_totals. `end: true` ends the event on end_date (default today, UTC).
export async function PATCH(request: NextRequest, { params }: Context) {
    const { id } = await params

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

    try {
        const current = await get_event_row(id)
        if (!current) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }
        // Start from the stored values; the payload overrides only the fields it names.
        const fields: Omit<typeof current, 'event_id'> = {
            name: current.name,
            start_date: current.start_date,
            end_date: current.end_date,
            account_ids: current.account_ids,
            count_in_totals: current.count_in_totals,
        }

        if (payload.name !== undefined) {
            const name = parseName(payload.name)
            if (!name) return NextResponse.json({ error: 'name must be 1-60 characters' }, { status: 400 })
            fields.name = name
        }
        if (payload.start_date !== undefined) {
            if (!isIsoDate(payload.start_date)) {
                return NextResponse.json({ error: 'start_date must be YYYY-MM-DD' }, { status: 400 })
            }
            fields.start_date = payload.start_date
        }
        if (payload.end === true) {
            const end_date = payload.end_date === undefined || payload.end_date === null ? todayIso() : payload.end_date
            if (!isIsoDate(end_date)) {
                return NextResponse.json({ error: 'end_date must be YYYY-MM-DD' }, { status: 400 })
            }
            fields.end_date = end_date
        }
        else if (payload.end_date !== undefined) {
            if (payload.end_date !== null && !isIsoDate(payload.end_date)) {
                return NextResponse.json({ error: 'end_date must be YYYY-MM-DD or null' }, { status: 400 })
            }
            fields.end_date = payload.end_date
        }
        if (fields.end_date !== null && fields.end_date < fields.start_date) {
            return NextResponse.json({ error: 'end_date cannot be before start_date' }, { status: 400 })
        }
        if (payload.account_ids !== undefined) {
            const account_ids = parseAccountIds(payload.account_ids)
            if (account_ids === null) {
                return NextResponse.json({ error: 'account_ids must be an array of account ids' }, { status: 400 })
            }
            if (account_ids.length > 0) {
                const known = new Set((await retrieve_accounts()).map((a) => a.account_id))
                const unknown = account_ids.filter((a) => !known.has(a))
                if (unknown.length > 0) {
                    return NextResponse.json({ error: 'Unknown account_ids', unknown }, { status: 400 })
                }
            }
            fields.account_ids = account_ids
        }
        if (payload.count_in_totals !== undefined) {
            if (typeof payload.count_in_totals !== 'boolean') {
                return NextResponse.json({ error: 'count_in_totals must be true or false' }, { status: 400 })
            }
            fields.count_in_totals = payload.count_in_totals
        }

        const { found, clash } = await update_event(id, fields)
        if (!found) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }
        if (clash) {
            return NextResponse.json(
                { error: `Overlaps with the event "${clash}"` },
                { status: 409 }
            )
        }
        return NextResponse.json({ message: `Updated event ${id}` })
    }
    catch {
        return NextResponse.json(
            { error: 'Failed to update event' },
            { status: 500 }
        )
    }
}

// Deletes the event and its overrides; its transactions return to the normal totals.
export async function DELETE(_request: NextRequest, { params }: Context) {
    const { id } = await params
    try {
        const { found } = await delete_event(id)
        if (!found) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }
        return NextResponse.json({ message: `Deleted event ${id}` })
    }
    catch {
        return NextResponse.json(
            { error: 'Failed to delete event' },
            { status: 500 }
        )
    }
}
