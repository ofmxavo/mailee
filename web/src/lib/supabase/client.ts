import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabasePublicEnv } from "@/lib/env"

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabasePublicEnv()

  if (!isConfigured || !url || !anonKey) {
    return null
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey)
  }

  return browserClient
}
