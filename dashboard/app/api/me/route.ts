import { NextRequest, NextResponse } from "next/server";

// proxy.ts has already verified the token and checked the allowlist by the time
// this runs, so reaching here means the caller is authorized.
export async function GET(request: NextRequest) {
    return NextResponse.json({ uid: request.headers.get('x-user-id') })
}
