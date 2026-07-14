import { NextResponse } from "next/server";
import { upsert_budget_limit } from "@/lib/queries";

type parseType = {
    primary_category: string,
    budget_limit: number
}

export async function POST(request: Request) {
    const payload: parseType = await request.json();
    const { primary_category, budget_limit } = payload

    try {
        await upsert_budget_limit(primary_category, budget_limit)
        return NextResponse.json({
            message: `Successfully set ${primary_category} budget limit as ${budget_limit}` })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to set budget limit' },
            { status: 500 }
        )
    }
}

export async function PUT(request: Request) {
    const payload: parseType = await request.json();
    const { primary_category, budget_limit } = payload

    try {
        await upsert_budget_limit(primary_category, budget_limit)
        return NextResponse.json({
            message: `Successfully set ${primary_category} budget limit as ${budget_limit}` })
    }
    catch (error) {
        return NextResponse.json(
            { error: 'Failed to set budget limit' },
            { status: 500 }
        )
    }
}