"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { isRedirectError } from "next/dist/client/components/redirect-error"

import { getDashboardContext } from "@/lib/dashboard-context"
import {
  ensureDefaultAgentId,
  ensureDefaultInboxId,
} from "@/lib/dashboard-defaults"
import { getMailFromFallback, getResendApiKey } from "@/lib/env"
import {
  ensureResendWebhook,
  findResendDomainByName,
  getResendDomain,
  mapDomainStatusForInbox,
  upsertResendDomain,
  verifyResendDomain,
} from "@/lib/resend"
import { getRequestBaseUrl } from "@/lib/site-url"

const REQUIRED_WEBHOOK_EVENTS = [
  "email.received",
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.delivery_delayed",
  "email.complained",
]

const MVP_SENDER_LOCAL_PART = "xavo"

function redirectWithNotice(
  type: "success" | "error" | "warning",
  message: string,
  scope: "page" | "connect" = "page"
): never {
  redirect(
    `/dashboard/setup?${type}=${encodeURIComponent(message)}&scope=${encodeURIComponent(scope)}`
  )
}

function toNullableTrimmed(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeDomainValue(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!normalized) {
    return null
  }

  const withoutProtocol = normalized.replace(/^https?:\/\//, "")
  const withoutPath = withoutProtocol.split("/")[0] ?? withoutProtocol
  const withoutPort = withoutPath.split(":")[0] ?? withoutPath

  if (!withoutPort || !withoutPort.includes(".")) {
    return null
  }

  return withoutPort
}

function deriveDomainFromEmail(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()
  const atIndex = normalized.lastIndexOf("@")

  if (atIndex <= 0 || atIndex >= normalized.length - 1) {
    return null
  }

  return normalizeDomainValue(normalized.slice(atIndex + 1))
}

function toMvpSendingDomain(value: string): string {
  return value.startsWith("mail.") ? value : `mail.${value}`
}

function buildMvpFromEmail(domain: string): string {
  return `${MVP_SENDER_LOCAL_PART}@${domain}`
}

async function resolveDefaultInboxIds() {
  const { supabase, organization } = await getDashboardContext()
  const agentId = await ensureDefaultAgentId(supabase, organization.id)
  const inboxId = await ensureDefaultInboxId(supabase, organization.id, agentId)

  return { supabase, organizationId: organization.id, inboxId }
}

async function ensureInboundWebhook(apiKey: string) {
  const baseUrl = await getRequestBaseUrl()
  const endpoint = `${baseUrl}/api/webhooks/resend`

  await ensureResendWebhook({
    apiKey,
    endpoint,
    events: REQUIRED_WEBHOOK_EVENTS,
  })
}

export async function saveSetupConfigAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const provider = String(formData.get("provider") ?? "resend").trim().toLowerCase()
  const fromEmail = toNullableTrimmed(formData.get("from_email"))
  const domainFromInputRaw = normalizeDomainValue(toNullableTrimmed(formData.get("domain")))
  const domainFromInput = domainFromInputRaw ? toMvpSendingDomain(domainFromInputRaw) : null
  const websiteUrl = toNullableTrimmed(formData.get("website_url"))

  if (![
    "manual",
    "resend",
  ].includes(provider)) {
    redirectWithNotice("error", "Invalid provider.")
  }

  if (websiteUrl && websiteUrl.length > 400) {
    redirectWithNotice("error", "Website URL is too long.")
  }

  try {
    const notices: string[] = []

    const agentId = await ensureDefaultAgentId(supabase, organization.id)
    const inboxId = await ensureDefaultInboxId(supabase, organization.id, agentId)

    const fallbackFrom = getMailFromFallback() ?? `concierge+${organization.id.slice(0, 8)}@mailee.local`
    const fallbackDomain = deriveDomainFromEmail(fallbackFrom) ?? "mailee.local"
    const resolvedDomain = toMvpSendingDomain(
      domainFromInput ?? deriveDomainFromEmail(fromEmail) ?? fallbackDomain
    )
    const resolvedFromEmail = buildMvpFromEmail(resolvedDomain)

    if (domainFromInputRaw && domainFromInputRaw !== resolvedDomain) {
      notices.push(`Sending domain normalized to ${resolvedDomain}.`)
    }

    if (fromEmail && fromEmail.trim().toLowerCase() !== resolvedFromEmail) {
      notices.push(`Sender email set to ${resolvedFromEmail} for MVP.`)
    }

    const { error: inboxError } = await supabase
      .from("inboxes")
      .update({
        provider,
        from_email: resolvedFromEmail,
        domain: resolvedDomain,
      })
      .eq("id", inboxId)
      .eq("organization_id", organization.id)

    if (inboxError) {
      redirectWithNotice("error", `Unable to save inbox settings: ${inboxError.message}`)
    }

    const { error: settingsError } = await supabase.from("organization_settings").upsert(
      {
        organization_id: organization.id,
        website_url: websiteUrl,
      },
      {
        onConflict: "organization_id",
      }
    )

    if (settingsError) {
      if (settingsError.code === "PGRST205") {
        notices.push(
          "Inbox settings were saved. Website context requires the latest database migration."
        )
      } else {
        redirectWithNotice(
          "error",
          `Unable to save website context: ${settingsError.message}`
        )
      }
    }

    revalidatePath("/dashboard/setup")

    const message =
      notices.length > 0
        ? `Setup saved. ${notices.join(" ")} MVP sender pattern is locked to xavo@<sending-domain>.`
        : "Setup saved. MVP sender pattern is locked to xavo@<sending-domain>."

    redirectWithNotice("success", message)
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to save setup: ${message}`)
  }
}

export async function syncResendDomainAction(formData: FormData) {
  const resendApiKey = getResendApiKey()

  if (!resendApiKey) {
    redirectWithNotice("error", "Email delivery service is not configured.", "connect")
  }

  try {
    const { supabase, organizationId, inboxId } = await resolveDefaultInboxIds()

    const domainInputRaw = normalizeDomainValue(toNullableTrimmed(formData.get("domain")))
    const fromEmail = toNullableTrimmed(formData.get("from_email"))

    if (!domainInputRaw) {
      redirectWithNotice(
        "error",
        "Add sending domain and save setup before connecting.",
        "connect"
      )
    }

    const domainInput = toMvpSendingDomain(domainInputRaw)
    const expectedFromEmail = buildMvpFromEmail(domainInput)

    const connectedDomain = await upsertResendDomain({
      apiKey: resendApiKey,
      domainName: domainInput,
    })

    await verifyResendDomain({
      apiKey: resendApiKey,
      domainId: connectedDomain.id,
    })

    const resendDomain = await getResendDomain({
      apiKey: resendApiKey,
      domainId: connectedDomain.id,
    })

    const mappedStatus = mapDomainStatusForInbox(resendDomain)

    const { error: updateError } = await supabase
      .from("inboxes")
      .update({
        from_email: expectedFromEmail,
        domain: domainInput,
        domain_status: mappedStatus,
      })
      .eq("id", inboxId)
      .eq("organization_id", organizationId)

    if (updateError) {
      redirectWithNotice(
        "error",
        `Domain connected, but save failed: ${updateError.message}`,
        "connect"
      )
    }

    await ensureInboundWebhook(resendApiKey)

    revalidatePath("/dashboard/setup")

    const notices: string[] = []

    if (domainInputRaw !== domainInput) {
      notices.push(`Domain normalized to ${domainInput}.`)
    }

    if (fromEmail && fromEmail.trim().toLowerCase() !== expectedFromEmail) {
      notices.push(`Sender email set to ${expectedFromEmail}.`)
    }

    const statusMessage =
      mappedStatus === "verified"
        ? "Domain connected and DNS verified."
        : "Domain connected. Add the DNS records below to finish verification."

    const message = `${notices.join(" ")} ${statusMessage}`.trim()

    redirectWithNotice(mappedStatus === "verified" ? "success" : "warning", message, "connect")
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to connect domain: ${message}`, "connect")
  }
}

export async function refreshResendDomainStatusAction(formData: FormData) {
  const resendApiKey = getResendApiKey()

  if (!resendApiKey) {
    redirectWithNotice("error", "Email delivery service is not configured.", "connect")
  }

  try {
    const { supabase, organizationId, inboxId } = await resolveDefaultInboxIds()

    const domainInputRaw = normalizeDomainValue(toNullableTrimmed(formData.get("domain")))

    if (!domainInputRaw) {
      redirectWithNotice("error", "Add a valid domain first.", "connect")
    }

    const domainInput = toMvpSendingDomain(domainInputRaw)

    const existingDomain = await findResendDomainByName({
      apiKey: resendApiKey,
      domainName: domainInput,
    })

    if (!existingDomain) {
      redirectWithNotice("error", "Domain not found yet. Click \"Connect domain\" first.", "connect")
    }

    await verifyResendDomain({
      apiKey: resendApiKey,
      domainId: existingDomain.id,
    })

    const resendDomain = await getResendDomain({
      apiKey: resendApiKey,
      domainId: existingDomain.id,
    })

    const mappedStatus = mapDomainStatusForInbox(resendDomain)

    const { error: updateError } = await supabase
      .from("inboxes")
      .update({
        from_email: buildMvpFromEmail(domainInput),
        domain: domainInput,
        domain_status: mappedStatus,
      })
      .eq("id", inboxId)
      .eq("organization_id", organizationId)

    if (updateError) {
      redirectWithNotice(
        "error",
        `Unable to update domain status: ${updateError.message}`,
        "connect"
      )
    }

    await ensureInboundWebhook(resendApiKey)

    revalidatePath("/dashboard/setup")
    redirectWithNotice(
      mappedStatus === "verified" ? "success" : "warning",
      mappedStatus === "verified"
        ? "DNS verified. Inbound replies are ready."
        : "Still pending DNS verification. DNS propagation or provider verification may still be in progress.",
      "connect"
    )
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to refresh domain status: ${message}`, "connect")
  }
}

export async function syncResendWebhookAction() {
  const resendApiKey = getResendApiKey()

  if (!resendApiKey) {
    redirectWithNotice("error", "Email delivery service is not configured.", "connect")
  }

  try {
    await getDashboardContext()
    await ensureInboundWebhook(resendApiKey)

    revalidatePath("/dashboard/setup")
    redirectWithNotice("success", "Inbound reply routing synced.", "connect")
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    redirectWithNotice("error", `Unable to sync inbound routing: ${message}`, "connect")
  }
}