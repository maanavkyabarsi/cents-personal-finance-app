import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { SESSION_EXPIRED_CODE } from '@/lib/session'

export async function authFetch(url: string, options?: RequestInit) {
    
    const user = auth.currentUser
    if (!user) throw new Error("User is not signed in.")

    const token = await user.getIdToken()

    const res = await fetch(url, {...options, headers: {...options?.headers, Authorization:`Bearer ${token}`}})

    // Catches the case where the hour elapsed while the tab was asleep and the
    // timer in AuthProvider had not fired yet.
    if (res.status === 401) {
        const body = await res.clone().json().catch(() => null)
        if (body?.code === SESSION_EXPIRED_CODE) await signOut(auth)
    }

    return res


}
