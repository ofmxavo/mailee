import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getServiceRoleKey, getSupabasePublicEnv } from "@/lib/env"

let adminClient: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient | null {
  const { url } = getSupabasePublicEnv()
  const serviceRoleKey = getServiceRoleKey()

  if (!url || !serviceRoleKey) {
    return null
  }

  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return adminClient
}
