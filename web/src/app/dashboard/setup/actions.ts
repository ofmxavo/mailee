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

const DEFAULT_SENDER_LOCAL_PART = "support"

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

function deriveLocalPartFromEmail(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()
  const atIndex = normalized.lastIndexOf("@")

  if (atIndex <= 0) {
    return null
  }

  const localPart = normalized.slice(0, atIndex).trim()
  return localPart.length > 0 ? localPart : null
}

function normalizeSenderLocalPart(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!normalized) {
    return null
  }

  const localOnly = normalized.includes("@") ? normalized.split("@")[0] : normalized
  const compact = localOnly.replace(/\s+/g, "")

  return compact.length > 0 ? compact : null
}

function isValidSenderLocalPart(value: string): boolean {
  return /^[a-z0-9][a-z0-9._+-]{0,62}$/.test(value)
}

function toSendingDomain(value: string): string {
  return value.startsWith("mail.") ? value : `mail.${value}`
}

function buildFromEmail(localPart: string, sendingDomain: string): string {
  return `${localPart}@${sendingDomain}`
}

function resolveSenderAndDomainFromForm(params: {
  formData: FormData
  fallbackFrom: string
  requireDomain: boolean
}): {
  domainInputRaw: string | null
  fromEmailInput: string | null
  senderLocalPart: string
  sendingDomain: string
  resolvedFromEmail: string
} {
  const { formData, fallbackFrom, requireDomain } = params

  const domainInputRaw = normalizeDomainValue(toNullableTrimmed(formData.get("domain")))
  const fromEmailInput = toNullableTrimmed(formData.get("from_email"))
  const senderLocalPartInput = normalizeSenderLocalPart(
    toNullableTrimmed(formData.get("sender_local_part"))
  )

  if (requireDomain && !domainInputRaw) {
    throw new Error("Add a valid sending domain first.")
  }

  const fallbackDomain = deriveDomainFromEmail(fallbackFrom)
  const domainSeed = domainInputRaw ?? deriveDomainFromEmail(fromEmailInput) ?? fallbackDomain

  if (!domainSeed) {
    throw new Error("Add a valid sending domain before continuing.")
  }

  const sendingDomain = toSendingDomain(domainSeed)
  const senderLocalPart =
    senderLocalPartInput ??
    deriveLocalPartFromEmail(fromEmailInput) ??
    deriveLocalPartFromEmail(fallbackFrom) ??
    DEFAULT_SENDER_LOCAL_PART

  if (!isValidSenderLocalPart(senderLocalPart)) {
    throw new Error(
      "Enter a valid sender email name using letters, numbers, dot, underscore, plus, or dash."
    )
  }

  return {
    domainInputRaw,
    fromEmailInput,
    senderLocalPart,
    sendingDomain,
    resolvedFromEmail: buildFromEmail(senderLocalPart, sendingDomain),
  }
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
  const websiteUrl = toNullableTrimmed(formData.get("website_url"))

  if (!["manual", "resend"].includes(provider)) {
    redirectWithNotice("error", "Invalid provider.")
  }

  if (websiteUrl && websiteUrl.length > 400) {
    redirectWithNotice("error", "Website URL is too long.")
  }

  try {
    const notices: string[] = []

    const agentId = await ensureDefaultAgentId(supabase, organization.id)
    const inboxId = await ensureDefaultInboxId(supabase, organization.id, agentId)

    const fallbackFrom =
      getMailFromFallback() ?? `concierge+${organization.id.slice(0, 8)}@mailee.local`

    const resolved = resolveSenderAndDomainFromForm({
      formData,
      fallbackFrom,
      requireDomain: true,
    })

    if (resolved.domainInputRaw && resolved.domainInputRaw !== resolved.sendingDomain) {
      notices.push(`Sending domain normalized to ${resolved.sendingDomain}.`)
    }

    if (resolved.fromEmailInput && resolved.fromEmailInput.toLowerCase() !== resolved.resolvedFromEmail) {
      notices.push(`Sender email set to ${resolved.resolvedFromEmail}.`)
    }

    const { error: inboxError } = await supabase
      .from("inboxes")
      .update({
        provider,
        from_email: resolved.resolvedFromEmail,
        domain: resolved.sendingDomain,
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

    const message = notices.length > 0 ? `Setup saved. ${notices.join(" ")}` : "Setup saved."
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

    const fallbackFrom =
      getMailFromFallback() ?? `concierge+${organizationId.slice(0, 8)}@mailee.local`

    const resolved = resolveSenderAndDomainFromForm({
      formData,
      fallbackFrom,
      requireDomain: true,
    })

    const connectedDomain = await upsertResendDomain({
      apiKey: resendApiKey,
      domainName: resolved.sendingDomain,
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
        from_email: resolved.resolvedFromEmail,
        domain: resolved.sendingDomain,
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

    if (resolved.domainInputRaw && resolved.domainInputRaw !== resolved.sendingDomain) {
      notices.push(`Domain normalized to ${resolved.sendingDomain}.`)
    }

    if (resolved.fromEmailInput && resolved.fromEmailInput.toLowerCase() !== resolved.resolvedFromEmail) {
      notices.push(`Sender email set to ${resolved.resolvedFromEmail}.`)
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

    const fallbackFrom =
      getMailFromFallback() ?? `concierge+${organizationId.slice(0, 8)}@mailee.local`

    const resolved = resolveSenderAndDomainFromForm({
      formData,
      fallbackFrom,
      requireDomain: true,
    })

    const existingDomain = await findResendDomainByName({
      apiKey: resendApiKey,
      domainName: resolved.sendingDomain,
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
        from_email: resolved.resolvedFromEmail,
        domain: resolved.sendingDomain,
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
