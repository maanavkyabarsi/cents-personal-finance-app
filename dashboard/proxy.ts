import { admin_auth } from "./lib/firebaseAdmin"; 
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
    const authorization = request.headers.get("authorization")
    if (authorization) {
        const [bearer, token] = authorization.split(" ", 2)
        let uid

        try {
            const decodedToken = await admin_auth.verifyIdToken(token)
            uid = decodedToken.uid

        }

        catch (error) {
            console.error('verifyIdToken failed:', error)
            return NextResponse.json(
                { error: 'Failed to verify authorization token' },
                { status: 401}
            )
        }

        const allowedUids = process.env.ALLOWED_UIDS?.split(",").map((s) => s.trim())
        
        if (!(allowedUids?.includes(uid))) {
            console.error('uid verification failed:', uid)
            return NextResponse.json(
                { error: 'Unauthorized user detected' },
                { status: 403 }
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