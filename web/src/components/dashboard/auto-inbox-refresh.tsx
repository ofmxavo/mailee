"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export function AutoInboxRefresh({
  enabled,
  intervalSeconds = 15,
}: {
  enabled: boolean
  intervalSeconds?: number
}) {
  const router = useRouter()
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(intervalSeconds)

  useEffect(() => {
    setSecondsUntilRefresh(intervalSeconds)
  }, [intervalSeconds])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const refreshTimer = window.setInterval(() => {
      router.refresh()
    }, intervalSeconds * 1000)

    const countdownTimer = window.setInterval(() => {
      setSecondsUntilRefresh((current) => {
        if (current <= 1) {
          return intervalSeconds
        }

        return current - 1
      })
    }, 1000)

    return () => {
      window.clearInterval(refreshTimer)
      window.clearInterval(countdownTimer)
    }
  }, [enabled, intervalSeconds, router])

  if (!enabled) {
    return null
  }

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      Auto-refreshing this inbox every {intervalSeconds}s. Next refresh in {secondsUntilRefresh}s.
    </div>
  )
}
