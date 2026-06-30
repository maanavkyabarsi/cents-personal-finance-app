import { NextResponse } from "next/server";
import { retrieve_transactions_primary_category_month } from "@/lib/queries";

export async function GET(request: Request) {
    const url = new URL(request.url)
    const primary_category = url.searchParams.get('primary_category')
    let month_year = url.searchParams.get('month_year')
    
    if (primary_category !== null && month_year !== null) {
        try {
            month_year += "-01"
            const rows = await retrieve_transactions_primary_category_month(primary_category, month_year)
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
            {error: 'Primary category and/or month and year are not defined'},
            {status: 500}
        )
    }

}

