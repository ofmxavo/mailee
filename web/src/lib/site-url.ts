import { headers } from "next/headers"

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "")
}

export async function getRequestBaseUrl(): Promise<string> {
  const headerStore = await headers()

  const forwardedProto = headerStore.get("x-forwarded-proto")
  const forwardedHost = headerStore.get("x-forwarded-host")
  const host = forwardedHost ?? headerStore.get("host")

  if (host) {
    const protocol = forwardedProto ?? (host.includes("localhost") ? "http" : "https")
    return `${protocol}://${host}`
  }

  const envBaseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (envBaseUrl) {
    return normalizeBaseUrl(envBaseUrl)
  }

  return "http://localhost:3000"
}
