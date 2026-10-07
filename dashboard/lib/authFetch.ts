import { auth } from '@/lib/firebase'

export async function authFetch(url: string, options?: RequestInit) {
    
    const user = auth.currentUser
    if (!user) throw new Error("User is not signed in.")

    const token = await user.getIdToken()

    const res = await fetch(url, {...options, headers: {...options?.headers, Authorization:`Bearer ${token}`}})

    return res


}