import { admin_auth } from "./lib/firebaseAdmin"; 
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MAX_SESSION_SECONDS, SESSION_EXPIRED_CODE } from "./lib/session";

export async function proxy(request: NextRequest) {
    const authorization = request.headers.get("authorization")
    if (authorization) {
        const [, token] = authorization.split(" ", 2)
        let uid: string
        let authTime: number

        try {
            const decodedToken = await admin_auth.verifyIdToken(token)
            uid = decodedToken.uid
            authTime = decodedToken.auth_time

        }

        catch (error) {
            console.error('verifyIdToken failed:', error)
            return NextResponse.json(
                { error: 'Failed to verify authorization token' },
                { status: 401}
            )
        }

        // auth_time only moves on a real re-authentication, so it survives the
        // silent ID token refreshes the client SDK performs every hour.
        const sessionAge = Math.floor(Date.now() / 1000) - authTime
        if (sessionAge > MAX_SESSION_SECONDS) {
            console.error('session expired for uid:', uid, 'age:', sessionAge)
            return NextResponse.json(
                { error: 'Session expired', code: SESSION_EXPIRED_CODE },
                { status: 401 }
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