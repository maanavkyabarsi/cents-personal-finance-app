import { NextResponse } from "next/server";
import { gold_spending_by_category } from "@/lib/queries";

export async function GET() {
    const rows = await gold_spending_by_category();
    return NextResponse.json(rows);
}