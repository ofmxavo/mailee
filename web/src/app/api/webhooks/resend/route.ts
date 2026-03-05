import { NextResponse } from "next/server"

export const runtime = "nodejs"

import {
  AUTOMATION_DAILY_SEND_LIMIT,
  buildBasicAutoReplyText,
  isAutomationActive,
} from "@/lib/automation"
import { ensureDefaultAgentId } from "@/lib/dashboard-defaults"
import { getResendApiKey, getResendWebhookSecret } from "@/lib/env"
import {
  extractResendWebhookHeaders,
  htmlToPlainText,
  normalizeEmailList,
  normalizeMessageId,
  parseDisplayName,
  parseEmailAddress,
  parseMessageIdList,
  retrieveReceivedEmailFromResend,
  sendEmailWithResend,
  verifyResendWebhookSignature,
} from "@/lib/resend"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

type ResendWebhookEvent = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    created_at?: string
    from?: string
    to?: string[]
    subject?: string
    message_id?: string
  }
}

type InboxRecord = {
  id: string
  organization_id: string
  agent_id: string | null
  from_name: string | null
  from_email: string
  reply_to_email: string | null
  domain: string | null
  domain_status: string
  is_default: boolean
  created_at: string
}

type ContactRecord = {
  id: string
  full_name: string | null
}

type ConversationRecord = {
  id: string
  agent_id: string
  subject: string
  ai_mode: "draft" | "auto"
  replies_paused: boolean
}

type MessageRecord = {
  id: string
}

type OrganizationSettingsRow = {
  default_ai_mode: "draft" | "auto" | null
  reply_style: string | null
  company_summary: string | null
}

function jsonReply(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status })
}

function normalizeConversationSubject(subject: string | null | undefined): string {
  const trimmed = String(subject ?? "").trim()

  if (trimmed.length === 0) {
    return "New inbound email"
  }

  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed
}

function normalizeReplySubject(subject: string | null | undefined): string {
  const base = normalizeConversationSubject(subject)
  return /^re:/i.test(base) ? base : `Re: ${base}`
}

function extractDomains(addresses: string[]): string[] {
  return Array.from(
    new Set(
      addresses
        .map((entry) => entry.split("@")[1]?.toLowerCase())
        .filter((entry): entry is string => Boolean(entry))
    )
  )
}

function sortInboxes(a: InboxRecord, b: InboxRecord): number {
  if (a.is_default !== b.is_default) {
    return a.is_default ? -1 : 1
  }

  return a.created_at.localeCompare(b.created_at)
}

function parseEmailParts(email: string): { localPart: string; domain: string } | null {
  const normalized = String(email ?? "").trim().toLowerCase()
  const [localPartRaw, domainRaw] = normalized.split("@")

  if (!localPartRaw || !domainRaw) {
    return null
  }

  return {
    localPart: localPartRaw,
    domain: domainRaw,
  }
}

function normalizeLocalPartForMatch(localPart: string): string {
  const normalized = localPart.trim().toLowerCase()
  const plusIndex = normalized.indexOf("+")

  if (plusIndex <= 0) {
    return normalized
  }

  return normalized.slice(0, plusIndex)
}

function pickInbox(inboxes: InboxRecord[], recipientEmails: string[]): InboxRecord | null {
  if (inboxes.length === 0 || recipientEmails.length === 0) {
    return null
  }

  const normalizedRecipients = recipientEmails.map((entry) => entry.toLowerCase())
  const recipientParts = normalizedRecipients
    .map((entry) => parseEmailParts(entry))
    .filter((entry): entry is { localPart: string; domain: string } => Boolean(entry))
  const domains = extractDomains(normalizedRecipients)

  const exactMatches = inboxes.filter((inbox) => {
    const fromEmail = inbox.from_email.toLowerCase()
    const replyToEmail = inbox.reply_to_email?.toLowerCase() ?? null

    return (
      normalizedRecipients.includes(fromEmail) ||
      Boolean(replyToEmail && normalizedRecipients.includes(replyToEmail))
    )
  })

  if (exactMatches.length > 1) {
    return null
  }

  if (exactMatches.length === 1) {
    return exactMatches.sort(sortInboxes)[0] ?? null
  }

  const localPartMatches = inboxes.filter((inbox) => {
    const inboxFromParts = parseEmailParts(inbox.from_email)
    const inboxReplyToParts = inbox.reply_to_email ? parseEmailParts(inbox.reply_to_email) : null

    return recipientParts.some((recipient) => {
      const recipientLocalPart = normalizeLocalPartForMatch(recipient.localPart)

      const fromMatch =
        inboxFromParts &&
        inboxFromParts.domain === recipient.domain &&
        normalizeLocalPartForMatch(inboxFromParts.localPart) === recipientLocalPart

      const replyToMatch =
        inboxReplyToParts &&
        inboxReplyToParts.domain === recipient.domain &&
        normalizeLocalPartForMatch(inboxReplyToParts.localPart) === recipientLocalPart

      return Boolean(fromMatch || replyToMatch)
    })
  })

  if (localPartMatches.length > 1) {
    return null
  }

  if (localPartMatches.length === 1) {
    return localPartMatches.sort(sortInboxes)[0] ?? null
  }

  const domainMatches = inboxes.filter((inbox) => {
    const domain = inbox.domain?.toLowerCase()
    return Boolean(domain && domains.includes(domain))
  })

  if (domainMatches.length > 1) {
    return null
  }

  if (domainMatches.length === 1) {
    return domainMatches.sort(sortInboxes)[0] ?? null
  }

  return null
}

function headerValue(headers: Record<string, string | string[] | null> | null, key: string) {
  if (!headers) {
    return null
  }

  const direct = headers[key]
  if (typeof direct === "string") {
    return direct
  }

  if (Array.isArray(direct) && direct.length > 0) {
    return direct.join(" ")
  }

  const lowerKey = key.toLowerCase()

  for (const [headerKey, headerValueEntry] of Object.entries(headers)) {
    if (headerKey.toLowerCase() !== lowerKey) {
      continue
    }

    if (typeof headerValueEntry === "string") {
      return headerValueEntry
    }

    if (Array.isArray(headerValueEntry) && headerValueEntry.length > 0) {
      return headerValueEntry.join(" ")
    }
  }

  return null
}

export async function POST(request: Request) {
  const webhookSecret = getResendWebhookSecret()

  if (!webhookSecret) {
    console.error("[api/webhooks/resend] Missing RESEND_WEBHOOK_SECRET")
    return jsonReply({ ok: false, error: "Webhook secret is not configured." }, 503)
  }

  const rawBody = await request.text()
  const webhookHeaders = extractResendWebhookHeaders(request.headers)

  const isValidSignature = verifyResendWebhookSignature({
    payload: rawBody,
    webhookSecret,
    headers: webhookHeaders,
  })

  if (!isValidSignature) {
    console.error("[api/webhooks/resend] Invalid webhook signature", {
      headers: webhookHeaders,
    })
    return jsonReply({ ok: false, error: "Invalid signature." }, 401)
  }

  let event: ResendWebhookEvent

  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent
  } catch {
    return jsonReply({ ok: false, error: "Invalid JSON payload." }, 400)
  }

  if (event.type !== "email.received") {
    return jsonReply({ ok: true, ignored: true, event_type: event.type ?? "unknown" })
  }

  const admin = getSupabaseAdminClient()

  if (!admin) {
    console.error("[api/webhooks/resend] Missing Supabase service role configuration")
    return jsonReply({ ok: false, error: "Supabase admin client is unavailable." }, 503)
  }

  const emailId = String(event.data?.email_id ?? "").trim()

  if (!emailId) {
    return jsonReply({ ok: true, ignored: true, reason: "missing_email_id" }, 202)
  }

  const { data: inboxes, error: inboxesError } = await admin
    .from("inboxes")
    .select(
      "id, organization_id, agent_id, from_name, from_email, reply_to_email, domain, domain_status, is_default, created_at"
    )

  if (inboxesError || !inboxes) {
    console.error("[api/webhooks/resend] Unable to load inboxes", inboxesError)
    return jsonReply({ ok: false, error: "Unable to load inbox mappings." }, 500)
  }

  const resendApiKey = getResendApiKey()

  let receivedEmail:
    | {
        to?: string[]
        from?: string
        subject?: string
        text?: string | null
        html?: string | null
        headers?: Record<string, string | string[] | null> | null
        message_id?: string
        created_at?: string
      }
    | null = null

  if (resendApiKey) {
    try {
      receivedEmail = await retrieveReceivedEmailFromResend({
        apiKey: resendApiKey,
        emailId,
      })
    } catch (error) {
      console.error("[api/webhooks/resend] Failed to retrieve received email", {
        error,
        emailId,
      })
    }
  }

  const senderRaw = receivedEmail?.from ?? event.data?.from ?? ""
  const senderEmail = parseEmailAddress(senderRaw)

  if (!senderEmail) {
    return jsonReply({ ok: true, ignored: true, reason: "missing_sender_email" }, 202)
  }

  const recipientEmails =
    normalizeEmailList(receivedEmail?.to ?? null).length > 0
      ? normalizeEmailList(receivedEmail?.to ?? null)
      : normalizeEmailList(event.data?.to ?? null)

  if (recipientEmails.length === 0) {
    return jsonReply({ ok: true, ignored: true, reason: "missing_recipient_email" }, 202)
  }

  const inbox = pickInbox(inboxes as InboxRecord[], recipientEmails)

  if (!inbox) {
    console.warn("[api/webhooks/resend] No inbox mapping matched inbound recipient", {
      recipients: recipientEmails,
      emailId,
    })
    return jsonReply({ ok: true, ignored: true, reason: "unmapped_recipient" }, 202)
  }

  const organizationId = inbox.organization_id
  const occurredAt =
    receivedEmail?.created_at ?? event.data?.created_at ?? event.created_at ?? new Date().toISOString()
  const inboundMessageIdHeader = normalizeMessageId(
    receivedEmail?.message_id ?? event.data?.message_id ?? null
  )

  const inReplyTo = normalizeMessageId(headerValue(receivedEmail?.headers ?? null, "in-reply-to"))
  const references = parseMessageIdList(headerValue(receivedEmail?.headers ?? null, "references"))

  const bodyText =
    String(receivedEmail?.text ?? "").trim() ||
    (receivedEmail?.html ? htmlToPlainText(receivedEmail.html) : "") ||
    `Inbound email from ${senderEmail}`

  const bodyHtml = receivedEmail?.html ?? null

  const { data: organizationSettings } = await admin
    .from("organization_settings")
    .select("default_ai_mode, reply_style, company_summary")
    .eq("organization_id", organizationId)
    .maybeSingle()

  const typedOrganizationSettings = (organizationSettings ?? null) as OrganizationSettingsRow | null
  const automationEnabled = isAutomationActive(typedOrganizationSettings?.default_ai_mode)

  const { data: duplicateMessage } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("provider_message_id", emailId)
    .eq("direction", "inbound")
    .maybeSingle()

  if (duplicateMessage) {
    return jsonReply({ ok: true, deduped: true, message_id: duplicateMessage.id })
  }

  let contactId: string

  const { data: existingContact, error: existingContactError } = await admin
    .from("contacts")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .eq("email", senderEmail)
    .maybeSingle()

  if (existingContactError) {
    console.error("[api/webhooks/resend] Failed to lookup contact", {
      error: existingContactError,
      organizationId,
      senderEmail,
    })
    return jsonReply({ ok: false, error: "Unable to lookup contact." }, 500)
  }

  if (existingContact) {
    contactId = (existingContact as ContactRecord).id
  } else {
    const displayName = parseDisplayName(senderRaw)

    const { data: createdContact, error: createContactError } = await admin
      .from("contacts")
      .insert({
        organization_id: organizationId,
        inbox_id: inbox.id,
        email: senderEmail,
        full_name: displayName,
      })
      .select("id")
      .single()

    if (createContactError || !createdContact) {
      console.error("[api/webhooks/resend] Failed to create contact", {
        error: createContactError,
        organizationId,
        senderEmail,
      })
      return jsonReply({ ok: false, error: "Unable to create contact." }, 500)
    }

    contactId = createdContact.id
  }

  let conversationId: string | null = null
  let conversationAgentId: string | null = null
  let conversationAiMode: "draft" | "auto" = "draft"
  let repliesPaused = false

  const threadLookupKeys = Array.from(new Set([inReplyTo, ...references].filter(Boolean)))

  if (threadLookupKeys.length > 0) {
    const { data: threadMatches, error: threadMatchError } = await admin
      .from("messages")
      .select("conversation_id, created_at")
      .eq("organization_id", organizationId)
      .in("message_id_header", threadLookupKeys)
      .order("created_at", { ascending: false })
      .limit(1)

    if (threadMatchError) {
      console.error("[api/webhooks/resend] Thread match by message_id_header failed", {
        error: threadMatchError,
        organizationId,
        threadLookupKeys,
      })
    }

    const matchedByHeader = threadMatches?.[0]

    if (matchedByHeader?.conversation_id) {
      conversationId = matchedByHeader.conversation_id
    } else {
      const { data: providerMatches, error: providerMatchError } = await admin
        .from("messages")
        .select("conversation_id, created_at")
        .eq("organization_id", organizationId)
        .in("provider_message_id", threadLookupKeys)
        .order("created_at", { ascending: false })
        .limit(1)

      if (providerMatchError) {
        console.error("[api/webhooks/resend] Thread match by provider_message_id failed", {
          error: providerMatchError,
          organizationId,
          threadLookupKeys,
        })
      }

      if (providerMatches?.[0]?.conversation_id) {
        conversationId = providerMatches[0].conversation_id
      }
    }
  }

  if (!conversationId) {
    const { data: fallbackConversation } = await admin
      .from("conversations")
      .select("id, agent_id, subject, ai_mode, replies_paused")
      .eq("organization_id", organizationId)
      .eq("inbox_id", inbox.id)
      .eq("contact_id", contactId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fallbackConversation) {
      const typedConversation = fallbackConversation as ConversationRecord
      conversationId = typedConversation.id
      conversationAgentId = typedConversation.agent_id
      conversationAiMode = typedConversation.ai_mode
      repliesPaused = typedConversation.replies_paused
    }
  }

  if (!conversationId) {
    const agentId = inbox.agent_id ?? (await ensureDefaultAgentId(admin, organizationId))

    const { data: createdConversation, error: createConversationError } = await admin
      .from("conversations")
      .insert({
        organization_id: organizationId,
        inbox_id: inbox.id,
        contact_id: contactId,
        agent_id: agentId,
        subject: normalizeConversationSubject(receivedEmail?.subject ?? event.data?.subject),
        channel: "email",
        status: "open",
        ai_mode: automationEnabled ? "auto" : "draft",
        started_at: occurredAt,
        last_message_at: occurredAt,
      })
      .select("id, agent_id, ai_mode, replies_paused")
      .single()

    if (createConversationError || !createdConversation) {
      console.error("[api/webhooks/resend] Failed to create conversation", {
        error: createConversationError,
        organizationId,
        contactId,
      })
      return jsonReply({ ok: false, error: "Unable to create conversation." }, 500)
    }

    conversationId = createdConversation.id
    conversationAgentId = createdConversation.agent_id
    conversationAiMode = createdConversation.ai_mode
    repliesPaused = createdConversation.replies_paused
  }

  if (conversationId && !conversationAgentId) {
    const { data: resolvedConversation } = await admin
      .from("conversations")
      .select("id, agent_id, ai_mode, replies_paused")
      .eq("organization_id", organizationId)
      .eq("id", conversationId)
      .maybeSingle()

    if (resolvedConversation) {
      const typedConversation = resolvedConversation as Pick<
        ConversationRecord,
        "id" | "agent_id" | "ai_mode" | "replies_paused"
      >
      conversationAgentId = typedConversation.agent_id
      conversationAiMode = typedConversation.ai_mode
      repliesPaused = typedConversation.replies_paused
    }
  }

  const { data: insertedMessage, error: insertMessageError } = await admin
    .from("messages")
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      contact_id: contactId,
      agent_id: conversationAgentId,
      direction: "inbound",
      provider_message_id: emailId,
      message_id_header: inboundMessageIdHeader,
      in_reply_to: inReplyTo,
      references,
      body_text: bodyText,
      body_html: bodyHtml,
      metadata: {
        provider: "resend",
        event_type: event.type,
        sender: senderRaw,
        recipients: recipientEmails,
        subject: receivedEmail?.subject ?? event.data?.subject ?? null,
        headers: receivedEmail?.headers ?? null,
      },
      sent_at: occurredAt,
    })
    .select("id")
    .single()

  if (insertMessageError || !insertedMessage) {
    console.error("[api/webhooks/resend] Failed to persist inbound message", {
      error: insertMessageError,
      organizationId,
      conversationId,
      emailId,
    })
    return jsonReply({ ok: false, error: "Unable to persist inbound message." }, 500)
  }

  const { error: conversationUpdateError } = await admin
    .from("conversations")
    .update({
      last_message_at: occurredAt,
    })
    .eq("id", conversationId)
    .eq("organization_id", organizationId)

  if (conversationUpdateError) {
    console.error("[api/webhooks/resend] Failed to update conversation timestamp", {
      error: conversationUpdateError,
      organizationId,
      conversationId,
    })
  }

  const canAttemptAutoReply =
    Boolean(resendApiKey) &&
    automationEnabled &&
    conversationAiMode === "auto" &&
    !repliesPaused &&
    inbox.domain_status === "verified" &&
    senderEmail.toLowerCase() !== inbox.from_email.toLowerCase()

  if (canAttemptAutoReply && conversationId) {
    try {
      const dayStartUtc = new Date()
      dayStartUtc.setUTCHours(0, 0, 0, 0)

      const { count: sentTodayCount } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("direction", "outbound")
        .eq("metadata->>origin", "automation")
        .gte("created_at", dayStartUtc.toISOString())

      if ((sentTodayCount ?? 0) < AUTOMATION_DAILY_SEND_LIMIT) {
        const replySubject = normalizeReplySubject(receivedEmail?.subject ?? event.data?.subject)
        const senderName = parseDisplayName(senderRaw)
        const replyText = buildBasicAutoReplyText({
          senderName,
          organizationName: "Mailee",
          replyStyle: typedOrganizationSettings?.reply_style ?? null,
          companySummary: typedOrganizationSettings?.company_summary ?? null,
        })

        const threadReference = inboundMessageIdHeader ?? normalizeMessageId(event.data?.message_id)
        const threadedReferences = Array.from(
          new Set(
            [...references, ...(inReplyTo ? [inReplyTo] : []), ...(threadReference ? [threadReference] : [])].filter(
              (entry): entry is string => Boolean(entry)
            )
          )
        )
        const headers: Record<string, string> = {}

        if (threadReference) {
          headers["In-Reply-To"] = threadReference
        }

        if (threadedReferences.length > 0) {
          headers.References = threadedReferences.join(" ")
        }

        const fromHeader = inbox.from_name
          ? `${inbox.from_name} <${inbox.from_email}>`
          : inbox.from_email

        const sentEmail = await sendEmailWithResend({
          apiKey: resendApiKey as string,
          from: fromHeader,
          to: [senderEmail],
          subject: replySubject,
          text: replyText,
          headers,
          replyTo: inbox.reply_to_email ? [inbox.reply_to_email] : undefined,
        })

        const autoReplySentAt = new Date().toISOString()

        const { error: autoReplyPersistError } = await admin.from("messages").insert({
          organization_id: organizationId,
          conversation_id: conversationId,
          contact_id: contactId,
          agent_id: conversationAgentId,
          direction: "outbound",
          provider_message_id: sentEmail.id,
          body_text: replyText,
          in_reply_to: threadReference,
          references: threadedReferences,
          metadata: {
            provider: "resend",
            origin: "automation",
            automation_kind: "inbound_auto_reply",
            in_response_to_message_id: (insertedMessage as MessageRecord).id,
          },
          sent_at: autoReplySentAt,
        })

        if (autoReplyPersistError) {
          console.error("[api/webhooks/resend] Failed to persist auto reply message", {
            error: autoReplyPersistError,
            organizationId,
            conversationId,
          })
        } else {
          await admin
            .from("conversations")
            .update({
              last_message_at: autoReplySentAt,
            })
            .eq("id", conversationId)
            .eq("organization_id", organizationId)
        }
      }
    } catch (autoReplyError) {
      console.error("[api/webhooks/resend] Auto reply flow failed", {
        error: autoReplyError,
        organizationId,
        conversationId,
      })
    }
  }

  return jsonReply({
    ok: true,
    conversation_id: conversationId,
    message_id: (insertedMessage as MessageRecord).id,
  })
}
