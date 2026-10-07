'use client'

import { Dashboard } from "@/components/Dashboard";
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from "react";

export default function Home() {
  const { user, authorized, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace("/login")
    else if (authorized === false) router.replace("/unauthorized")
  },[ user, authorized, loading, router ])

  if (loading || !user || !authorized) return null

  return <Dashboard />;
}
