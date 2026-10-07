'use client';
import { auth } from '@/lib/firebase'
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
    async function handleSignIn() {

        try {
            await signInWithPopup(auth, new GoogleAuthProvider())
        } catch (error) {
            console.error(error)
        }
    }

    const { user,loading } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!loading && user) {
            router.push("/")
        }
            
    }, [user, loading, router])

    return <button onClick={handleSignIn}>
        Sign in with Google
    </button>
}
