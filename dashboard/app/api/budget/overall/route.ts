import { NextResponse } from "next/server";
import {
    OVERALL_CATEGORY,
    retrieve_overall_budget,
    upsert_budget_limit,
} from "@/lib/queries";

type parseType = {
    budget_limit: number
}

export async function GET() {
    try {
        const rows = await retrieve_overall_budget()
        const first = Array.isArray(rows) && rows.length ? rows[0] : null
        return NextResponse.json({ budget_limit: first ? first.budget_limit : null })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to get overall budget' },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    const payload: parseType = await request.json();
    const { budget_limit } = payload

    try {
        await upsert_budget_limit(OVERALL_CATEGORY, budget_limit)
        return NextResponse.json({ message: `Successfully set overall budget as ${budget_limit}` })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to set overall budget' },
            { status: 500 }
        )
    }
}

export async function PUT(request: Request) {
    const payload: parseType = await request.json();
    const { budget_limit } = payload

    try {
        await upsert_budget_limit(OVERALL_CATEGORY, budget_limit)
        return NextResponse.json({ message: `Successfully updated overall budget as ${budget_limit}` })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to update overall budget' },
            { status: 500 }
        )
    }
}
