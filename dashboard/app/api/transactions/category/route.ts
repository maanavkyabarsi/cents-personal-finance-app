import { NextRequest, NextResponse } from "next/server";
import { set_transaction_category } from "@/lib/queries";
import { isTaggableCategory } from "@/lib/categories";

type parseType = {
    transaction_id?: unknown
    primary_category?: unknown
}

async function readPayload(request: NextRequest): Promise<parseType | null> {
    try {
        return await request.json()
    }
    catch {
        return null
    }
}

function readTransactionId(payload: parseType | null) {
    return payload && typeof payload.transaction_id === 'string' && payload.transaction_id
        ? payload.transaction_id
        : null
}

export async function POST(request: NextRequest) {
    const payload = await readPayload(request)
    const transaction_id = readTransactionId(payload)
    if (!transaction_id) {
        return NextResponse.json(
            { error: 'transaction_id is required' },
            { status: 400 }
        )
    }

    const primary_category = payload?.primary_category
    if (typeof primary_category !== 'string' || !isTaggableCategory(primary_category)) {
        return NextResponse.json(
            { error: 'primary_category is invalid' },
            { status: 400 }
        )
    }

    try {
        const { found, taggable } = await set_transaction_category(transaction_id, primary_category, request.headers.get('x-user-id'))
        if (!found) {
            return NextResponse.json(
                { error: 'Transaction not found' },
                { status: 404 }
            )
        }
        if (!taggable) {
            return NextResponse.json(
                { error: 'Transaction cannot be tagged' },
                { status: 400 }
            )
        }
        return NextResponse.json({ message: `Tagged transaction ${transaction_id} as ${primary_category}` })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to tag transaction' },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest) {
    const transaction_id = readTransactionId(await readPayload(request))
    if (!transaction_id) {
        return NextResponse.json(
            { error: 'transaction_id is required' },
            { status: 400 }
        )
    }

    try {
        const { found } = await set_transaction_category(transaction_id, null, null)
        if (!found) {
            return NextResponse.json(
                { error: 'Transaction not found' },
                { status: 404 }
            )
        }
        return NextResponse.json({ message: `Cleared tag on transaction ${transaction_id}` })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to clear tag' },
            { status: 500 }
        )
    }
}
