import { admin_auth } from "./lib/firebaseAdmin"; 
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
    const authorization = request.headers.get("authorization")
    if (authorization) {
        const [bearer, token] = authorization.split(" ", 2)
        let uid

        try {
            const decodedToken = await admin_auth.verifyIdToken(token)
            uid = decodedToken.uid

        }

        catch (error) {
            return NextResponse.json(
                { error: 'Failed to verify authorization token' },
                { status: 401}
            )
        }
        
        const response = NextResponse.next()
        response.headers.set('x-user-id', uid)
        return response

    } else {
        return NextResponse.json(
            { error: 'Failed to retrieve authorization token' },
            { status: 401 }
        )
    }
}

export const config = {
    matcher: "/api/:path*"

}