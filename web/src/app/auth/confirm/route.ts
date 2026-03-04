import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { getRequestBaseUrl } from "@/lib/site-url"
import { getSupabaseServerClient } from "@/lib/supabase/server"

function buildRedirect(baseUrl: string, pathnameWithQuery: string): URL {
  return new URL(pathnameWithQuery, baseUrl)
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null
  const next = requestUrl.searchParams.get("next")

  const baseUrl = await getRequestBaseUrl()
  const supabase = await getSupabaseServerClient()

  if (!supabase) {
    return NextResponse.redirect(
      buildRedirect(baseUrl, "/sign-in?error=Supabase%20is%20not%20configured")
    )
  }

  const safeNextPath = next && next.startsWith("/") ? next : "/dashboard"

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(buildRedirect(baseUrl, safeNextPath))
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })

    if (!error) {
      return NextResponse.redirect(buildRedirect(baseUrl, safeNextPath))
    }
  }

  return NextResponse.redirect(
    buildRedirect(
      baseUrl,
      "/sign-in?error=Invalid%20or%20expired%20email%20confirmation%20link"
    )
  )
}
