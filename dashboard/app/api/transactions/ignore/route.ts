import { NextRequest, NextResponse } from "next/server";
import { ignore_transaction, unignore_transaction } from "@/lib/queries";

type parseType = {
    transaction_id: string
}

async function readTransactionId(request: NextRequest) {
    try {
        const payload: parseType = await request.json();
        return typeof payload.transaction_id === 'string' && payload.transaction_id ? payload.transaction_id : null
    }
    catch {
        return null
    }
}

export async function POST(request: NextRequest) {
    const transaction_id = await readTransactionId(request)
    if (!transaction_id) {
        return NextResponse.json(
            { error: 'transaction_id is required' },
            { status: 400 }
        )
    }

    try {
        const { found } = await ignore_transaction(transaction_id, request.headers.get('x-user-id'))
        if (!found) {
            return NextResponse.json(
                { error: 'Transaction not found' },
                { status: 404 }
            )
        }
        return NextResponse.json({ message: `Ignored transaction ${transaction_id}` })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to ignore transaction' },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest) {
    const transaction_id = await readTransactionId(request)
    if (!transaction_id) {
        return NextResponse.json(
            { error: 'transaction_id is required' },
            { status: 400 }
        )
    }

    try {
        const { found } = await unignore_transaction(transaction_id)
        if (!found) {
            return NextResponse.json(
                { error: 'Transaction not found' },
                { status: 404 }
            )
        }
        return NextResponse.json({ message: `Unignored transaction ${transaction_id}` })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to unignore transaction' },
            { status: 500 }
        )
    }
}
