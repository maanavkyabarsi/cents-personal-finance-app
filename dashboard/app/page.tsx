'use client'

import { Dashboard } from "@/components/Dashboard";
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
      if (!loading && !user)
        router.push("/login")
  },[ user, loading, router ])

  if (loading || !user) return null

  return <Dashboard />;
}
