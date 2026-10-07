'use client';
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/primitives';
import { Alert } from '@/components/icons';

export default function UnauthorizedPage() {
    const { user, authorized, loading } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (loading) return
        if (!user) router.replace("/login")
        else if (authorized) router.replace("/")
    }, [user, authorized, loading, router])

    if (loading || !user || authorized) return null

    return (
        <AuthShell>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                <Alert size={24} />
            </div>

            <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
                Access denied
            </p>
            <h1 className="mt-1.5 font-serif text-3xl font-medium tracking-[-0.01em] text-text">
                You don&apos;t have access.
            </h1>
            <p className="mt-3 text-sm text-muted">
                <span className="font-medium text-text">{user.email ?? "This account"}</span>{" "}
                isn&apos;t authorized to use cents. If you think this is a mistake,
                contact the owner of this dashboard.
            </p>

            {/* Signing out flips user to null, and the effect above sends them to /login. */}
            <Button
                variant="primary"
                onClick={() => signOut(auth)}
                className="mt-8 h-11 w-full"
            >
                Sign in with a different account
            </Button>
        </AuthShell>
    )
}
