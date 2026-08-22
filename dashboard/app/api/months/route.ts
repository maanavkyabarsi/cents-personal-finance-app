import { NextResponse } from "next/server";
import { retrieve_available_months } from "@/lib/queries";

export async function GET() {
    try {
        const months = await retrieve_available_months()
        return NextResponse.json(months)
    }

    catch (error) {
        return NextResponse.json(
            {error: 'Failed to retrieve available months'},
            {status: 500}
        )
    }
}
