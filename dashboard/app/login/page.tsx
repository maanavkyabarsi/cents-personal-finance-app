'use client';
import { auth } from '@/lib/firebase'
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/primitives';
import { RingMark } from '@/components/icons';

// The user dismissing the popup isn't an error worth showing.
const IGNORED_ERRORS = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']

export default function LoginPage() {
    const { user, authorized, loading } = useAuth()
    const router = useRouter()
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (loading || !user) return
        router.replace(authorized ? "/" : "/unauthorized")
    }, [user, authorized, loading, router])

    async function handleSignIn() {
        setPending(true)
        setError(null)

        // Always show the account chooser so someone sent to /unauthorized can
        // pick a different Google account instead of being signed straight back in.
        const provider = new GoogleAuthProvider()
        provider.setCustomParameters({ prompt: 'select_account' })

        try {
            await signInWithPopup(auth, provider)
        } catch (error) {
            console.error(error)
            if (!(error instanceof FirebaseError && IGNORED_ERRORS.includes(error.code))) {
                setError("Couldn't sign you in. Please try again.")
            }
        } finally {
            setPending(false)
        }
    }

    if (loading || user) return null

    return (
        <AuthShell>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <RingMark size={26} />
            </div>

            <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
                Welcome to cents
            </p>
            <h1 className="mt-1.5 font-serif text-3xl font-medium tracking-[-0.01em] text-text">
                Know where every cent goes.
            </h1>
            <p className="mt-3 text-sm text-muted">
                Analyze your expenditures, track budgets, and spot trends.
            </p>

            <Button
                onClick={handleSignIn}
                disabled={pending}
                className="mt-8 h-11 w-full"
            >
                <GoogleMark />
                {pending ? "Signing in…" : "Continue with Google"}
            </Button>

            {error && (
                <p className="mt-3 text-center text-sm text-danger" role="alert">
                    {error}
                </p>
            )}

            <p className="mt-6 border-t border-border pt-5 text-center text-xs text-subtle">
                Access is limited to approved accounts.
            </p>
        </AuthShell>
    )
}

function GoogleMark() {
    return (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
    )
}
