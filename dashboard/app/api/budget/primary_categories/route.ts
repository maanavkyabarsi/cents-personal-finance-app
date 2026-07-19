import { NextResponse } from "next/server";
import { retrieve_primary_categories } from "@/lib/queries";

export async function GET() {
    try {
        const rows = await retrieve_primary_categories()
        return NextResponse.json(rows)
    }

    catch (error) {
        return NextResponse.json(
            {error: 'Failed to retrieve primary categories and budgets'},
            {status: 500}
        )
    }
}