import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

import { getSupabasePublicEnv } from "@/lib/env"

export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const { url, anonKey, isConfigured } = getSupabasePublicEnv()

  if (!isConfigured || !url || !anonKey) {
    return null
  }

  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          try {
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          } catch {
            // This is expected during static rendering. Middleware can refresh auth cookies instead.
          }
        }
      },
    },
  })
}
