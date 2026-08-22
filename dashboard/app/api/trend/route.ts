import { NextResponse } from "next/server";
import { retrieve_spending_trends } from "@/lib/queries";

export async function GET(request: Request) {
    const url = new URL(request.url)
    let view = url.searchParams.get('view')
    let account_id = url.searchParams.get('account_id')
    let primary_category = url.searchParams.get('primary_category')
    let detailed_category = url.searchParams.get('detailed_category')

    if (view == 'week' || view == 'month' || view == 'ytd' || view == 'year' || view == 'all') {
        let grain: string
        let start_date: string | null
        const current_date = new Date()

        switch (view) {
            case 'week': {
                grain = 'DAY'
                const start = new Date(current_date.getTime() - 7 * 24 * 60 * 60 * 1000)                
                start_date = start.toISOString().slice(0, 10)
                break;
            }

            case 'month': {
                grain = 'DAY'
                const start = new Date(current_date.getTime() - 30 * 24 * 60 * 60 * 1000)
                start_date = start.toISOString().slice(0, 10)
                break;
            }
            
            case 'ytd': {
                grain = 'MONTH'
                const year = current_date.getFullYear()
                const start = new Date(year, 0, 1)
                start_date = start.toISOString().slice(0, 10)
                break;
            }
            
            case 'year': {
                grain = 'MONTH'
                const start = new Date(current_date.getTime() - 365 * 24 * 60 * 60 * 1000)
                start_date = start.toISOString().slice(0, 10)
                break;
            }
            
            case 'all': {
                grain = 'MONTH'
                start_date = null
                break;
            }
        }

        try {
            const rows = await retrieve_spending_trends(grain, start_date, account_id, primary_category, detailed_category)
            return NextResponse.json(rows)
        }

        catch (error) {
            return NextResponse.json(
                {error: 'Failed to get spending trends'},
                {status: 500}
            )
        }
    
        // else {
        //     return NextResponse.json(
        //         {error: 'Grain not defined'},
        //         {status: 400}
        //     )
        // }
    }

    else {
        return NextResponse.json(
            {error: 'Failed to define proper view'},
            {status: 400}
        )
    }


}