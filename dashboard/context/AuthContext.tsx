'use client'

import { User, onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { createContext, useState, useEffect, useContext } from "react"

type Context = {
    user: User | null
    loading: boolean
}
export const authContext = createContext<Context>({ user: null , loading: false})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState<boolean>(true)
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser)
            setLoading(false)
        })

        return () => unsubscribe()
    },[])

    return <authContext.Provider value={{user, loading}}>
        {children}
    </authContext.Provider>
}

export function useAuth() {
    const result = useContext(authContext)
    return result
}