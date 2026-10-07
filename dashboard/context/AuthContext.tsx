'use client'

import { User, onAuthStateChanged, signOut } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { MAX_SESSION_MS } from "@/lib/session"
import { authFetch } from "@/lib/authFetch"
import { createContext, useState, useEffect, useContext } from "react"

type Context = {
    user: User | null
    // null until /api/me answers for the signed-in user
    authorized: boolean | null
    loading: boolean
}
export const authContext = createContext<Context>({ user: null, authorized: null, loading: false})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState<boolean>(true)
    const [access, setAccess] = useState<{ uid: string, authorized: boolean } | null>(null)
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser)
            setLoading(false)
        })

        return () => unsubscribe()
    },[])

    // Sign out an hour after the user actually authenticated. onAuthStateChanged
    // does not fire on silent token refreshes, so this runs once per sign-in.
    useEffect(() => {
        if (!user) return

        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | undefined

        user.getIdTokenResult().then((result) => {
            if (cancelled) return
            const expiresAt = new Date(result.authTime).getTime() + MAX_SESSION_MS
            timer = setTimeout(() => signOut(auth), Math.max(0, expiresAt - Date.now()))
        }).catch((error) => console.error('failed to read auth time:', error))

        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [user])

    // Ask the server whether this account is on the allowlist. Only an explicit
    // 403 from proxy.ts means unauthorized; other failures fall through so the
    // dashboard's own error state can surface them.
    useEffect(() => {
        if (!user) return

        let cancelled = false
        const uid = user.uid

        authFetch('/api/me')
            .then((res) => {
                if (!cancelled) setAccess({ uid, authorized: res.status !== 403 })
            })
            .catch((error) => {
                console.error('authorization check failed:', error)
                if (!cancelled) setAccess({ uid, authorized: true })
            })

        return () => {
            cancelled = true
        }
    }, [user])

    // Keyed by uid so a stale answer for a previous account is never reused.
    const authorized = user && access?.uid === user.uid ? access.authorized : null
    const checking = user !== null && authorized === null

    return <authContext.Provider value={{user, authorized, loading: loading || checking}}>
        {children}
    </authContext.Provider>
}

export function useAuth() {
    const result = useContext(authContext)
    return result
}
