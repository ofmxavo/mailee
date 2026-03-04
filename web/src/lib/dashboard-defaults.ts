import type { SupabaseClient } from "@supabase/supabase-js"

import { getMailFromFallback } from "@/lib/env"

export async function ensureDefaultAgentId(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from("agents")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Unable to load default agent: ${existingError.message}`)
  }

  if (existing) {
    return existing.id
  }

  const { data: created, error: createError } = await supabase
    .from("agents")
    .insert({
      organization_id: organizationId,
      name: "Mailee Concierge",
      description: "Default assistant for MVP conversations.",
      status: "active",
      approval_mode: "hybrid",
    })
    .select("id")
    .single()

  if (createError) {
    throw new Error(`Unable to create default agent: ${createError.message}`)
  }

  return created.id
}

export async function ensureDefaultInboxId(
  supabase: SupabaseClient,
  organizationId: string,
  agentId: string
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from("inboxes")
    .select("id")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Unable to load default inbox: ${existingError.message}`)
  }

  if (existing) {
    return existing.id
  }

  const fallbackFromEmail =
    getMailFromFallback() ?? `concierge+${organizationId.slice(0, 8)}@mailee.local`
  const fallbackDomain = fallbackFromEmail.split("@")[1] ?? "mailee.local"

  const { data: created, error: createError } = await supabase
    .from("inboxes")
    .insert({
      organization_id: organizationId,
      agent_id: agentId,
      provider: "resend",
      from_name: "Mailee Concierge",
      from_email: fallbackFromEmail,
      domain: fallbackDomain,
      domain_status: "pending",
      is_default: true,
    })
    .select("id")
    .single()

  if (createError && createError.code !== "23505") {
    throw new Error(`Unable to create default inbox: ${createError.message}`)
  }

  if (createError?.code === "23505") {
    const { data: fromRetry, error: retryError } = await supabase
      .from("inboxes")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("from_email", fallbackFromEmail)
      .single()

    if (retryError) {
      throw new Error(`Unable to load default inbox: ${retryError.message}`)
    }

    return fromRetry.id
  }

  if (!created) {
    throw new Error("Unable to create default inbox.")
  }

  return created.id
}
