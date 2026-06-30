import { NextResponse } from "next/server";
import { retrieve_total_spending_month } from "@/lib/queries";

export async function GET(request: Request) {
    const url = new URL(request.url)
    let month_year = url.searchParams.get('month_year')
    
    if (month_year !== null) {
        month_year += "-01"
        try {
            const rows = await retrieve_total_spending_month(month_year)
            return NextResponse.json(rows)
        }

        catch (error) {
            return NextResponse.json(
                {error: 'Failed to get transactions'},
                {status: 500}
            )
        }
    }

    else {
        return NextResponse.json(
            {error: 'Month not defined'},
            {status: 400}
        )
    }
}