"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { isRedirectError } from "next/dist/client/components/redirect-error"

import { buildIntroEmailText, isAutomationActive } from "@/lib/automation"
import { getDashboardContext } from "@/lib/dashboard-context"
import { ensureDefaultAgentId, ensureDefaultInboxId } from "@/lib/dashboard-defaults"
import { getResendApiKey } from "@/lib/env"
import { sendEmailWithResend } from "@/lib/resend"

type ContactRow = {
  id: string
  email: string
  full_name: string | null
  company: string | null
}

type InboxRow = {
  id: string
  provider: string
  from_name: string | null
  from_email: string
  reply_to_email: string | null
  domain_status: string
}

type OrganizationSettingsRow = {
  default_ai_mode: "draft" | "auto" | null
  website_url: string | null
}

function redirectWithNotice(type: "success" | "error" | "warning", message: string): never {
  redirect(`/dashboard/users?${type}=${encodeURIComponent(message)}`)
}

function toNullable(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null
  }

  return normalized
}

function normalizeLifecycleStage(value: string | null | undefined): "trial" | "active" | "at_risk" | "churned" {
  const normalized = String(value ?? "trial")
    .trim()
    .toLowerCase()

  if (normalized === "active" || normalized === "at_risk" || normalized === "churned") {
    return normalized
  }

  return "trial"
}

async function ensureConversationForContact(params: {
  supabase: Awaited<ReturnType<typeof getDashboardContext>>["supabase"]
  organizationId: string
  contactId: string
  contactEmail: string
  automationMode: "draft" | "auto" | null
}): Promise<string> {
  const { supabase, organizationId, contactId, contactEmail, automationMode } = params

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingConversation?.id) {
    return existingConversation.id
  }

  const agentId = await ensureDefaultAgentId(supabase, organizationId)
  const inboxId = await ensureDefaultInboxId(supabase, organizationId, agentId)

  const { data: createdConversation, error: createConversationError } = await supabase
    .from("conversations")
    .insert({
      organization_id: organizationId,
      inbox_id: inboxId,
      contact_id: contactId,
      agent_id: agentId,
      subject: `Welcome ${contactEmail}`,
      channel: "email",
      status: "open",
      ai_mode: isAutomationActive(automationMode) ? "auto" : "draft",
    })
    .select("id")
    .single()

  if (createConversationError || !createdConversation) {
    throw new Error("Unable to create conversation for this user.")
  }

  return createdConversation.id
}

async function sendIntroMessage(params: {
  supabase: Awaited<ReturnType<typeof getDashboardContext>>["supabase"]
  organizationId: string
  organizationName: string
  contact: ContactRow
  conversationId: string
  websiteUrl: string | null
  origin: string
}): Promise<{ sent: boolean; reason?: string }> {
  const resendApiKey = getResendApiKey()

  if (!resendApiKey) {
    return { sent: false, reason: "Resend API key is not configured." }
  }

  const { data: inbox } = await params.supabase
    .from("inboxes")
    .select("id, provider, from_name, from_email, reply_to_email, domain_status")
    .eq("organization_id", params.organizationId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const typedInbox = (inbox ?? null) as InboxRow | null

  if (!typedInbox) {
    return { sent: false, reason: "No inbox is configured yet." }
  }

  if (typedInbox.provider !== "resend") {
    return { sent: false, reason: "Default inbox provider is not Resend." }
  }

  if (typedInbox.domain_status !== "verified") {
    return { sent: false, reason: "Sending domain is not verified yet." }
  }

  const fromHeader = typedInbox.from_name
    ? `${typedInbox.from_name} <${typedInbox.from_email}>`
    : typedInbox.from_email

  const introText = buildIntroEmailText({
    contactName: params.contact.full_name,
    organizationName: params.organizationName,
    websiteUrl: params.websiteUrl,
  })

  const resendResponse = await sendEmailWithResend({
    apiKey: resendApiKey,
    from: fromHeader,
    to: [params.contact.email],
    subject: `Welcome to ${params.organizationName}`,
    text: introText,
    replyTo: typedInbox.reply_to_email ? [typedInbox.reply_to_email] : undefined,
  })

  const sentAt = new Date().toISOString()

  const { error: messageError } = await params.supabase.from("messages").insert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    contact_id: params.contact.id,
    direction: "outbound",
    provider_message_id: resendResponse.id,
    body_text: introText,
    metadata: {
      provider: "resend",
      origin: params.origin,
      automation_kind: "intro",
    },
    sent_at: sentAt,
  })

  if (messageError) {
    throw new Error("Intro email sent but could not be persisted.")
  }

  await params.supabase
    .from("conversations")
    .update({
      last_message_at: sentAt,
    })
    .eq("id", params.conversationId)
    .eq("organization_id", params.organizationId)

  return { sent: true }
}

export async function uploadUsersCsvAction(formData: FormData) {
  try {
    await getDashboardContext()

    const csvFile = formData.get("users_csv")

    if (!(csvFile instanceof File) || csvFile.size <= 0) {
      redirectWithNotice("error", "Choose a CSV file before uploading.")
    }

    if (csvFile.size > 5 * 1024 * 1024) {
      redirectWithNotice("error", "CSV must be 5MB or smaller for this beta uploader.")
    }

    const fileName = csvFile.name.toLowerCase()
    const isCsvType = csvFile.type.toLowerCase().includes("csv")

    if (!fileName.endsWith(".csv") && !isCsvType) {
      redirectWithNotice("error", "Upload a valid .csv file.")
    }

    const csvText = await csvFile.text()
    const rows = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (rows.length < 2) {
      redirectWithNotice("error", "CSV needs a header row plus at least one user row.")
    }

    const headers = rows[0]
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)

    if (!headers.includes("email")) {
      redirectWithNotice("error", 'CSV header must include an "email" column.')
    }

    const userRowCount = Math.max(0, rows.length - 1)

    redirectWithNotice(
      "success",
      `CSV parsed (${userRowCount} rows detected). Queue-based import + dedupe is next.`
    )
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to process CSV: ${message}`)
  }
}

export async function addManualUserAction(formData: FormData) {
  try {
    const { supabase, organization } = await getDashboardContext()

    const email = normalizeEmail(toNullable(formData.get("email")))
    const fullName = toNullable(formData.get("full_name"))
    const company = toNullable(formData.get("company"))
    const lifecycleStage = normalizeLifecycleStage(toNullable(formData.get("lifecycle_stage")))

    if (!email) {
      redirectWithNotice("error", "Enter a valid email address.")
    }

    const agentId = await ensureDefaultAgentId(supabase, organization.id)
    const inboxId = await ensureDefaultInboxId(supabase, organization.id, agentId)

    const { data: contact, error: upsertError } = await supabase
      .from("contacts")
      .upsert(
        {
          organization_id: organization.id,
          inbox_id: inboxId,
          email,
          full_name: fullName,
          company,
          lifecycle_stage: lifecycleStage,
        },
        {
          onConflict: "organization_id,email",
        }
      )
      .select("id, email, full_name, company")
      .single()

    if (upsertError || !contact) {
      redirectWithNotice("error", "Unable to save user.")
    }

    const { data: settings } = await supabase
      .from("organization_settings")
      .select("default_ai_mode, website_url")
      .eq("organization_id", organization.id)
      .maybeSingle()

    const typedSettings = (settings ?? null) as OrganizationSettingsRow | null
    const conversationId = await ensureConversationForContact({
      supabase,
      organizationId: organization.id,
      contactId: contact.id,
      contactEmail: contact.email,
      automationMode: typedSettings?.default_ai_mode ?? "draft",
    })

    if (isAutomationActive(typedSettings?.default_ai_mode)) {
      const result = await sendIntroMessage({
        supabase,
        organizationId: organization.id,
        organizationName: organization.name,
        contact: contact as ContactRow,
        conversationId,
        websiteUrl: typedSettings?.website_url ?? null,
        origin: "automation_auto_add_user",
      })

      revalidatePath("/dashboard/users")
      revalidatePath("/dashboard/inbox")

      if (!result.sent) {
        redirectWithNotice(
          "warning",
          `User saved, but intro email was not sent: ${result.reason ?? "unknown reason"}.`
        )
      }

      redirectWithNotice("success", "User saved and intro email sent.")
    }

    revalidatePath("/dashboard/users")
    redirectWithNotice("success", "User saved. Activate automation to start auto outreach.")
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to add user: ${message}`)
  }
}

export async function openUserThreadAction(formData: FormData) {
  try {
    const { supabase, organization } = await getDashboardContext()
    const contactId = String(formData.get("contact_id") ?? "").trim()

    if (!contactId) {
      redirectWithNotice("error", "Missing contact.")
    }

    const { data: contact } = await supabase
      .from("contacts")
      .select("id, email")
      .eq("organization_id", organization.id)
      .eq("id", contactId)
      .maybeSingle()

    if (!contact) {
      redirectWithNotice("error", "User not found.")
    }

    const { data: settings } = await supabase
      .from("organization_settings")
      .select("default_ai_mode")
      .eq("organization_id", organization.id)
      .maybeSingle()

    const conversationId = await ensureConversationForContact({
      supabase,
      organizationId: organization.id,
      contactId: contact.id,
      contactEmail: contact.email,
      automationMode: (settings?.default_ai_mode as "draft" | "auto" | null) ?? "draft",
    })

    redirect(
      `/dashboard/inbox?conversation=${encodeURIComponent(conversationId)}&success=${encodeURIComponent("Thread opened.")}`
    )
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to open thread: ${message}`)
  }
}

export async function sendUserIntroNowAction(formData: FormData) {
  try {
    const { supabase, organization } = await getDashboardContext()
    const contactId = String(formData.get("contact_id") ?? "").trim()

    if (!contactId) {
      redirectWithNotice("error", "Missing contact.")
    }

    const { data: contact } = await supabase
      .from("contacts")
      .select("id, email, full_name, company")
      .eq("organization_id", organization.id)
      .eq("id", contactId)
      .maybeSingle()

    if (!contact) {
      redirectWithNotice("error", "User not found.")
    }

    const { data: settings } = await supabase
      .from("organization_settings")
      .select("default_ai_mode, website_url")
      .eq("organization_id", organization.id)
      .maybeSingle()

    const typedSettings = (settings ?? null) as OrganizationSettingsRow | null

    const conversationId = await ensureConversationForContact({
      supabase,
      organizationId: organization.id,
      contactId: contact.id,
      contactEmail: contact.email,
      automationMode: typedSettings?.default_ai_mode ?? "draft",
    })

    const result = await sendIntroMessage({
      supabase,
      organizationId: organization.id,
      organizationName: organization.name,
      contact: contact as ContactRow,
      conversationId,
      websiteUrl: typedSettings?.website_url ?? null,
      origin: "manual_intro_send",
    })

    revalidatePath("/dashboard/users")
    revalidatePath("/dashboard/inbox")

    if (!result.sent) {
      redirectWithNotice(
        "warning",
        `User thread created, but intro email not sent: ${result.reason ?? "unknown reason"}.`
      )
    }

    redirectWithNotice("success", "Intro email sent.")
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to send intro email: ${message}`)
  }
}
