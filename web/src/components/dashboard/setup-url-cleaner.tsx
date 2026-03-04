"use client"

import { useEffect } from "react"

export function SetupUrlCleaner() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const hadNoticeParams =
      url.searchParams.has("success") ||
      url.searchParams.has("error") ||
      url.searchParams.has("warning") ||
      url.searchParams.has("scope")

    if (!hadNoticeParams) {
      return
    }

    url.searchParams.delete("success")
    url.searchParams.delete("error")
    url.searchParams.delete("warning")
    url.searchParams.delete("scope")

    const nextSearch = url.searchParams.toString()
    const nextPath = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`
    window.history.replaceState({}, "", nextPath)
  }, [])

  return null
}
