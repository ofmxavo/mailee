"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getDashboardContext } from "@/lib/dashboard-context"

function redirectWithNotice(type: "success" | "error", message: string): never {
  redirect(`/dashboard/conversations?${type}=${encodeURIComponent(message)}`)
}

async function ensureDefaultAgentId(
  organizationId: string,
  supabase: Awaited<ReturnType<typeof getDashboardContext>>["supabase"]
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

async function ensureDefaultInboxId(
  organizationId: string,
  agentId: string,
  supabase: Awaited<ReturnType<typeof getDashboardContext>>["supabase"]
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from("inboxes")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Unable to load default inbox: ${existingError.message}`)
  }

  if (existing) {
    return existing.id
  }

  const fromEmail = `concierge+${organizationId.slice(0, 8)}@mailee.local`

  const { data: created, error: createError } = await supabase
    .from("inboxes")
    .insert({
      organization_id: organizationId,
      agent_id: agentId,
      provider: "resend",
      from_name: "Mailee Concierge",
      from_email: fromEmail,
      domain: "mailee.local",
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
      .eq("from_email", fromEmail)
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

export async function createConversationAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const contactId = String(formData.get("contact_id") ?? "").trim()
  const subject = String(formData.get("subject") ?? "").trim()
  const status = String(formData.get("status") ?? "open").trim() || "open"

  if (!contactId) {
    redirectWithNotice("error", "Select a contact for the conversation.")
  }

  if (subject.length < 3 || subject.length > 200) {
    redirectWithNotice("error", "Subject must be between 3 and 200 characters.")
  }

  if (!["open", "pending", "closed"].includes(status)) {
    redirectWithNotice("error", "Invalid conversation status.")
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("organization_id", organization.id)
    .maybeSingle()

  if (contactError) {
    redirectWithNotice("error", "Unable to validate selected contact.")
  }

  if (!contact) {
    redirectWithNotice("error", "Selected contact was not found.")
  }

  try {
    const agentId = await ensureDefaultAgentId(organization.id, supabase)
    const inboxId = await ensureDefaultInboxId(organization.id, agentId, supabase)

    const { error } = await supabase.from("conversations").insert({
      organization_id: organization.id,
      contact_id: contact.id,
      subject,
      status,
      agent_id: agentId,
      inbox_id: inboxId,
    })

    if (error) {
      redirectWithNotice("error", "Unable to create conversation right now.")
    }
  } catch {
    redirectWithNotice("error", "Unable to create conversation right now.")
  }

  revalidatePath("/dashboard/conversations")
  redirectWithNotice("success", "Conversation created.")
}
