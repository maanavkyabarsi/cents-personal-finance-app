import { NextResponse } from "next/server";
import { retrieve_dashboard_overview } from "@/lib/queries";

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
        const overview = await retrieve_dashboard_overview(month_year, account_id)
        return NextResponse.json(overview)
    }

    catch (error) {
        return NextResponse.json(
            {error: 'Failed to retrieve dashboard overview'},
            {status: 500}
        )
    }
}
