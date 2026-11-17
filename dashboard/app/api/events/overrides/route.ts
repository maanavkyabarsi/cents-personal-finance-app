import { NextRequest, NextResponse } from "next/server";
import { set_event_override } from "@/lib/events";

type Payload = {
    transaction_id?: unknown
    mode?: unknown
    event_id?: unknown
}

async function readPayload(request: NextRequest): Promise<Payload | null> {
    try {
        const payload = await request.json()
        return payload && typeof payload === 'object' ? payload : null
    }
    catch {
        return null
    }
}

function readTransactionId(payload: Payload | null) {
    return payload && typeof payload.transaction_id === 'string' && payload.transaction_id
        ? payload.transaction_id
        : null
}

// Manually include a transaction in an event ({mode: 'include', event_id}) or keep it out
// of the event its date would put it in ({mode: 'exclude'}).
export async function POST(request: NextRequest) {
    const payload = await readPayload(request)
    const transaction_id = readTransactionId(payload)
    if (!transaction_id) {
        return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    const mode = payload?.mode
    if (mode !== 'include' && mode !== 'exclude') {
        return NextResponse.json({ error: "mode must be 'include' or 'exclude'" }, { status: 400 })
    }

    let event_id: string | null = null
    if (mode === 'include') {
        if (typeof payload?.event_id !== 'string' || !payload.event_id) {
            return NextResponse.json({ error: 'event_id is required to include a transaction' }, { status: 400 })
        }
        event_id = payload.event_id
    }

    try {
        const result = await set_event_override(transaction_id, mode, event_id, request.headers.get('x-user-id'))
        if (!result.tx_found) {
            return NextResponse.json({ error: 'Transaction not found or cannot be in an event' }, { status: 404 })
        }
        if (mode === 'include' && !result.event_found) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }
        if (mode === 'exclude' && !result.in_event) {
            return NextResponse.json({ error: 'Transaction is not in an event' }, { status: 400 })
        }
        return NextResponse.json({ message: `Set ${mode} override on transaction ${transaction_id}` })
    }
    catch {
        return NextResponse.json(
            { error: 'Failed to update event membership' },
            { status: 500 }
        )
    }
}

// Removes the manual override so the transaction follows the date/account rule again.
export async function DELETE(request: NextRequest) {
    const transaction_id = readTransactionId(await readPayload(request))
    if (!transaction_id) {
        return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    try {
        const result = await set_event_override(transaction_id, 'clear', null, null)
        if (!result.tx_found) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }
        return NextResponse.json({ message: `Cleared event override on transaction ${transaction_id}` })
    }
    catch {
        return NextResponse.json(
            { error: 'Failed to clear event override' },
            { status: 500 }
        )
    }
}
