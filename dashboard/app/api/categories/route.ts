import { NextResponse } from "next/server";
import { retrieve_category_summaries } from "@/lib/queries";

export async function GET(request: Request) {
    const url = new URL(request.url)
    const month = url.searchParams.get('month')
    const account_id = url.searchParams.get('account_id')

    if (month === null) {
        return NextResponse.json(
            {error: 'Month not defined'},
            {status: 400}
        )
    }

    try {
        const month_year = month + "-01"
        const summaries = await retrieve_category_summaries(month_year, account_id)
        return NextResponse.json(summaries)
    }

    catch (error) {
        return NextResponse.json(
            {error: 'Failed to retrieve category summaries'},
            {status: 500}
        )
    }
}
