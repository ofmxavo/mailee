import { NextResponse } from "next/server"

export const runtime = "nodejs"

import { getMailFromFallback, getResendApiKey } from "@/lib/env"
import { sendEmailWithResend } from "@/lib/resend"
import { getSupabaseServerClient } from "@/lib/supabase/server"

type SendEmailRequestPayload = {
  conversation_id?: string
  body_text?: string
  subject?: string
}

type ConversationRecord = {
  id: string
  organization_id: string
  inbox_id: string
  contact_id: string
  subject: string
  agent_id: string
  replies_paused: boolean
  replies_paused_reason: string | null
}

type ContactRecord = {
  id: string
  email: string
}

type InboxRecord = {
  id: string
  provider: string
  from_name: string | null
  from_email: string
  reply_to_email: string | null
  domain: string | null
}

type ParentMessageRecord = {
  message_id_header: string | null
  provider_message_id: string | null
  references: string[]
}

const MVP_SENDER_LOCAL_PART = "xavo"

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    { status }
  )
}

function normalizeSubject(subject: string): string {
  const trimmed = subject.trim()
  if (trimmed.length === 0) {
    return "Re: Conversation"
  }
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed
}

function normalizeDomain(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!normalized || !normalized.includes(".")) {
    return null
  }

  const withoutProtocol = normalized.replace(/^https?:\/\//, "")
  const withoutPath = withoutProtocol.split("/")[0] ?? withoutProtocol
  const withoutPort = withoutPath.split(":")[0] ?? withoutPath

  return withoutPort.length > 0 ? withoutPort : null
}

function deriveDomainFromEmail(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()
  const atIndex = normalized.lastIndexOf("@")

  if (atIndex <= 0 || atIndex >= normalized.length - 1) {
    return null
  }

  return normalizeDomain(normalized.slice(atIndex + 1))
}

function buildMvpFromEmail(domain: string): string {
  return `${MVP_SENDER_LOCAL_PART}@${domain}`
}

export async function POST(request: Request) {
  const resendApiKey = getResendApiKey()

  if (!resendApiKey) {
    return jsonError("RESEND_API_KEY is not configured.", 503)
  }

  const supabase = await getSupabaseServerClient()

  if (!supabase) {
    return jsonError("Supabase is not configured.", 503)
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonError("Unauthorized.", 401)
  }

  let payload: SendEmailRequestPayload

  try {
    payload = (await request.json()) as SendEmailRequestPayload
  } catch {
    return jsonError("Invalid request body.")
  }

  const conversationId = String(payload.conversation_id ?? "").trim()
  const bodyText = String(payload.body_text ?? "").trim()
  const subjectOverride = String(payload.subject ?? "").trim()

  if (!conversationId) {
    return jsonError("conversation_id is required.")
  }

  if (bodyText.length === 0) {
    return jsonError("body_text is required.")
  }

  if (bodyText.length > 10000) {
    return jsonError("body_text is too long.")
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select(
      "id, organization_id, inbox_id, contact_id, subject, agent_id, replies_paused, replies_paused_reason"
    )
    .eq("id", conversationId)
    .maybeSingle()

  if (conversationError) {
    return jsonError("Unable to load conversation.", 500)
  }

  if (!conversation) {
    return jsonError("Conversation not found.", 404)
  }

  const typedConversation = conversation as ConversationRecord

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", typedConversation.organization_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (membershipError) {
    return jsonError("Unable to verify organization access.", 500)
  }

  if (!membership) {
    return jsonError("Forbidden.", 403)
  }

  if (typedConversation.replies_paused) {
    return jsonError(
      typedConversation.replies_paused_reason
        ? `Replies are paused: ${typedConversation.replies_paused_reason}`
        : "Replies are paused for this conversation.",
      409
    )
  }

  const [{ data: contact, error: contactError }, { data: inbox, error: inboxError }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, email")
        .eq("id", typedConversation.contact_id)
        .eq("organization_id", typedConversation.organization_id)
        .maybeSingle(),
      supabase
        .from("inboxes")
        .select("id, provider, from_name, from_email, reply_to_email, domain")
        .eq("id", typedConversation.inbox_id)
        .eq("organization_id", typedConversation.organization_id)
        .maybeSingle(),
    ])

  if (contactError || !contact) {
    return jsonError("Conversation contact could not be loaded.", 500)
  }

  if (inboxError || !inbox) {
    return jsonError("Conversation inbox could not be loaded.", 500)
  }

  const typedContact = contact as ContactRecord
  const typedInbox = inbox as InboxRecord

  if (typedInbox.provider !== "resend") {
    return jsonError("Inbox provider is not configured for Resend.", 400)
  }

  const { data: parentMessage, error: parentMessageError } = await supabase
    .from("messages")
    .select("message_id_header, provider_message_id, references")
    .eq("organization_id", typedConversation.organization_id)
    .eq("conversation_id", typedConversation.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (parentMessageError) {
    return jsonError("Unable to resolve conversation threading state.", 500)
  }

  const typedParentMessage = (parentMessage ?? null) as ParentMessageRecord | null

  const inReplyTo =
    typedParentMessage?.message_id_header ?? typedParentMessage?.provider_message_id ?? null

  const references = Array.from(
    new Set(
      [
        ...(typedParentMessage?.references ?? []),
        ...(typedParentMessage?.message_id_header ? [typedParentMessage.message_id_header] : []),
      ].filter((entry): entry is string => Boolean(entry))
    )
  )

  const headers: Record<string, string> = {}

  if (inReplyTo) {
    headers["In-Reply-To"] = inReplyTo
  }

  if (references.length > 0) {
    headers.References = references.join(" ")
  }

  const baseSubject = subjectOverride || typedConversation.subject
  const normalizedSubject = normalizeSubject(
    inReplyTo && !/^re:/i.test(baseSubject) ? `Re: ${baseSubject}` : baseSubject
  )

  const fallbackFrom =
    getMailFromFallback() ??
    `concierge+${typedConversation.organization_id.slice(0, 8)}@mailee.local`

  const fromEmail = typedInbox.from_email || fallbackFrom
  const inboxDomain = normalizeDomain(typedInbox.domain)
  const fromEmailDomain = deriveDomainFromEmail(fromEmail)

  if (inboxDomain && fromEmailDomain !== inboxDomain) {
    return jsonError(
      "Sender email domain must exactly match the connected sending domain. Update setup first.",
      409
    )
  }

  if (inboxDomain) {
    const expectedFromEmail = buildMvpFromEmail(inboxDomain)

    if (fromEmail.trim().toLowerCase() !== expectedFromEmail) {
      return jsonError(
        `Sender email must be ${expectedFromEmail} for MVP. Update setup first.`,
        409
      )
    }
  }

  const fromHeader = typedInbox.from_name
    ? `${typedInbox.from_name} <${fromEmail}>`
    : fromEmail

  try {
    const resendResponse = await sendEmailWithResend({
      apiKey: resendApiKey,
      from: fromHeader,
      to: [typedContact.email],
      subject: normalizedSubject,
      text: bodyText,
      headers,
      replyTo: typedInbox.reply_to_email ? [typedInbox.reply_to_email] : undefined,
    })

    const nowIso = new Date().toISOString()

    const { data: insertedMessage, error: insertMessageError } = await supabase
      .from("messages")
      .insert({
        organization_id: typedConversation.organization_id,
        conversation_id: typedConversation.id,
        contact_id: typedConversation.contact_id,
        agent_id: typedConversation.agent_id,
        direction: "outbound",
        provider_message_id: resendResponse.id,
        body_text: bodyText,
        metadata: {
          provider: "resend",
          webhook_tracking: {
            expected_event: "email.sent",
          },
          headers,
        },
        in_reply_to: inReplyTo,
        references,
        sent_at: nowIso,
      })
      .select("id")
      .single()

    if (insertMessageError) {
      console.error("[api/email/send] Failed to persist outbound message", {
        error: insertMessageError,
        conversationId,
      })
      return jsonError("Email sent but message persistence failed.", 500)
    }

    const { error: updateConversationError } = await supabase
      .from("conversations")
      .update({
        last_message_at: nowIso,
      })
      .eq("id", typedConversation.id)
      .eq("organization_id", typedConversation.organization_id)

    if (updateConversationError) {
      console.error("[api/email/send] Unable to update conversation timestamp", {
        error: updateConversationError,
        conversationId,
      })
    }

    return NextResponse.json({
      ok: true,
      message_id: insertedMessage.id,
      provider_message_id: resendResponse.id,
    })
  } catch (error) {
    console.error("[api/email/send] Failed to send via Resend", {
      error,
      conversationId,
      organizationId: typedConversation.organization_id,
    })

    return jsonError("Unable to send with Resend.", 502)
  }
}
