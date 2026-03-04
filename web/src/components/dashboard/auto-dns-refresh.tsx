"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function AutoDnsRefresh({
  enabled,
  intervalSeconds = 20,
}: {
  enabled: boolean
  intervalSeconds?: number
}) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) {
      return
    }

    const timer = window.setInterval(() => {
      router.refresh()
    }, intervalSeconds * 1000)

    return () => window.clearInterval(timer)
  }, [enabled, intervalSeconds, router])

  return null
}
