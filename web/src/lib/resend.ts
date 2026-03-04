import { createHmac, timingSafeEqual } from "node:crypto"

const RESEND_API_BASE_URL = "https://api.resend.com"

type HeaderSource = Headers | Record<string, string | null | undefined>

type ResendSendOptions = {
  apiKey: string
  from: string
  to: string[]
  subject: string
  text?: string
  html?: string
  headers?: Record<string, string>
  replyTo?: string[]
}

type ResendApiError = {
  name?: string
  message?: string
}

type ResendSendResponse = {
  id?: string
  object?: string
  error?: ResendApiError
}

type ResendReceivedEmailResponse = {
  id?: string
  to?: string[]
  from?: string
  created_at?: string
  subject?: string
  html?: string | null
  text?: string | null
  headers?: Record<string, string | string[] | null> | null
  cc?: string[]
  bcc?: string[]
  reply_to?: string[]
  message_id?: string
}

type ResendDomainCapabilities = {
  sending?: "enabled" | "disabled"
  receiving?: "enabled" | "disabled"
}

export type ResendDomainRecord = {
  record: string
  name: string
  value: string
  type: string
  status: string
  ttl?: string
  priority?: number
}

export type ResendDomain = {
  id: string
  name: string
  status: string
  capabilities?: ResendDomainCapabilities
  records?: ResendDomainRecord[]
  region?: string
}

type ResendDomainListResponse = {
  data?: ResendDomain[]
  error?: ResendApiError
}

type ResendDomainResponse = {
  object?: string
  id?: string
  name?: string
  status?: string
  capabilities?: ResendDomainCapabilities
  records?: ResendDomainRecord[]
  region?: string
  error?: ResendApiError
}

type ResendWebhook = {
  id: string
  endpoint: string
  events: string[]
  status: "enabled" | "disabled" | string
}

type ResendWebhookListResponse = {
  data?: ResendWebhook[]
  error?: ResendApiError
}

function toRecord(headers: HeaderSource): Record<string, string | null | undefined> {
  if (typeof (headers as Headers).get === "function") {
    const mapped: Record<string, string> = {}

    ;(headers as Headers).forEach((value, key) => {
      mapped[key.toLowerCase()] = value
    })

    return mapped
  }

  return Object.entries(headers).reduce<Record<string, string | null | undefined>>(
    (accumulator, [key, value]) => {
      accumulator[key.toLowerCase()] = value
      return accumulator
    },
    {}
  )
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function normalizeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim()
  const raw = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed
  return Buffer.from(raw, "base64")
}

function normalizeDomainName(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!normalized) {
    return null
  }

  const withoutProtocol = normalized.replace(/^https?:\/\//, "")
  const withoutPath = withoutProtocol.split("/")[0] ?? withoutProtocol
  const withoutPort = withoutPath.split(":")[0] ?? withoutPath

  if (!withoutPort || withoutPort.length < 3 || !withoutPort.includes(".")) {
    return null
  }

  return withoutPort
}

function resolveResendErrorMessage(payload: { error?: ResendApiError } | null, status: number) {
  return payload?.error?.message ?? `Resend returned HTTP ${status}`
}

function parseRetryAfterToMs(value: string | null): number | null {
  if (!value) {
    return null
  }

  const seconds = Number.parseInt(value, 10)

  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000
  }

  const dateMs = Date.parse(value)

  if (Number.isFinite(dateMs)) {
    const diff = dateMs - Date.now()
    return diff > 0 ? diff : 0
  }

  return null
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchResend(
  input: string,
  init: RequestInit,
  options?: {
    maxRetries?: number
  }
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 2
  let attempt = 0

  while (true) {
    const response = await fetch(input, init)

    if (response.status !== 429 || attempt >= maxRetries) {
      return response
    }

    const retryAfterMs = parseRetryAfterToMs(response.headers.get("retry-after"))
    const backoffMs = retryAfterMs ?? Math.min(4000, 500 * 2 ** attempt)

    attempt += 1
    await waitMs(backoffMs)
  }
}

function isDomainVerified(domain: ResendDomain | null | undefined): boolean {
  if (!domain) {
    return false
  }

  const status = String(domain.status ?? "").toLowerCase()
  const allRecordsVerified = (domain.records ?? []).every(
    (record) => String(record.status ?? "").toLowerCase() === "verified"
  )

  return status === "verified" && allRecordsVerified
}

export function mapDomainStatusForInbox(domain: ResendDomain | null | undefined):
  | "pending"
  | "verified"
  | "failed" {
  if (!domain) {
    return "pending"
  }

  if (isDomainVerified(domain)) {
    return "verified"
  }

  const rawStatus = String(domain.status ?? "").toLowerCase()

  if (rawStatus.includes("fail") || rawStatus === "invalid") {
    return "failed"
  }

  if ((domain.records ?? []).some((record) => String(record.status).toLowerCase().includes("fail"))) {
    return "failed"
  }

  return "pending"
}

export function extractResendWebhookHeaders(headers: HeaderSource): {
  id?: string
  timestamp?: string
  signature?: string
} {
  const normalized = toRecord(headers)

  return {
    id: normalized["svix-id"] ?? normalized["webhook-id"] ?? undefined,
    timestamp:
      normalized["svix-timestamp"] ?? normalized["webhook-timestamp"] ?? undefined,
    signature:
      normalized["svix-signature"] ?? normalized["webhook-signature"] ?? undefined,
  }
}

export function verifyResendWebhookSignature(params: {
  payload: string
  webhookSecret: string
  headers: {
    id?: string | null
    timestamp?: string | null
    signature?: string | null
  }
  toleranceSeconds?: number
}): boolean {
  const { payload, webhookSecret, headers, toleranceSeconds = 300 } = params
  const id = headers.id?.trim()
  const timestamp = headers.timestamp?.trim()
  const signature = headers.signature?.trim()

  if (!id || !timestamp || !signature) {
    return false
  }

  const numericTimestamp = Number.parseInt(timestamp, 10)

  if (!Number.isFinite(numericTimestamp)) {
    return false
  }

  if (toleranceSeconds > 0) {
    const nowInSeconds = Math.floor(Date.now() / 1000)
    const ageSeconds = Math.abs(nowInSeconds - numericTimestamp)

    if (ageSeconds > toleranceSeconds) {
      return false
    }
  }

  const secret = normalizeWebhookSecret(webhookSecret)

  if (secret.length === 0) {
    return false
  }

  const signedContent = `${id}.${timestamp}.${payload}`
  const expectedSignature = createHmac("sha256", secret)
    .update(signedContent)
    .digest("base64")

  const signatureCandidates = signature
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [version, value] = entry.split(",")

      if (version === "v1" && value) {
        return [value]
      }

      if (!version && value) {
        return [value]
      }

      return [] as string[]
    })

  if (signatureCandidates.length === 0) {
    return false
  }

  return signatureCandidates.some((candidate) => {
    const expectedBuffer = Buffer.from(expectedSignature)
    const candidateBuffer = Buffer.from(candidate)

    if (expectedBuffer.length !== candidateBuffer.length) {
      return false
    }

    return timingSafeEqual(expectedBuffer, candidateBuffer)
  })
}

export async function sendEmailWithResend(options: ResendSendOptions): Promise<{ id: string }> {
  const response = await fetchResend(`${RESEND_API_BASE_URL}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      headers: options.headers,
      reply_to: options.replyTo,
    }),
  })

  const responseText = await response.text()
  const payload = parseJson<ResendSendResponse>(responseText)

  if (!response.ok) {
    const message = payload?.error?.message ?? `Resend returned HTTP ${response.status}`
    throw new Error(`Unable to send email with Resend: ${message}`)
  }

  if (!payload?.id) {
    throw new Error("Resend send response did not include an email id.")
  }

  return { id: payload.id }
}

export async function retrieveReceivedEmailFromResend(params: {
  apiKey: string
  emailId: string
}): Promise<ResendReceivedEmailResponse> {
  const response = await fetchResend(
    `${RESEND_API_BASE_URL}/emails/receiving/${encodeURIComponent(params.emailId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
    }
  )

  const responseText = await response.text()
  const payload = parseJson<ResendReceivedEmailResponse & { error?: ResendApiError }>(
    responseText
  )

  if (!response.ok) {
    const message = payload?.error?.message ?? `Resend returned HTTP ${response.status}`
    throw new Error(`Unable to fetch received email content from Resend: ${message}`)
  }

  return payload ?? {}
}

export async function listResendDomains(params: { apiKey: string }): Promise<ResendDomain[]> {
  const response = await fetchResend(`${RESEND_API_BASE_URL}/domains`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    cache: "no-store",
  })

  const responseText = await response.text()
  const payload = parseJson<ResendDomainListResponse>(responseText)

  if (!response.ok) {
    throw new Error(resolveResendErrorMessage(payload, response.status))
  }

  return payload?.data ?? []
}

export async function getResendDomain(params: {
  apiKey: string
  domainId: string
}): Promise<ResendDomain> {
  const response = await fetchResend(
    `${RESEND_API_BASE_URL}/domains/${encodeURIComponent(params.domainId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      cache: "no-store",
    }
  )

  const responseText = await response.text()
  const payload = parseJson<ResendDomainResponse>(responseText)

  if (!response.ok) {
    throw new Error(resolveResendErrorMessage(payload, response.status))
  }

  if (!payload?.id || !payload?.name) {
    throw new Error("Resend domain response is missing id or name.")
  }

  return {
    id: payload.id,
    name: payload.name,
    status: payload.status ?? "pending",
    capabilities: payload.capabilities,
    records: payload.records ?? [],
    region: payload.region,
  }
}

export async function verifyResendDomain(params: {
  apiKey: string
  domainId: string
}): Promise<void> {
  const response = await fetchResend(
    `${RESEND_API_BASE_URL}/domains/${encodeURIComponent(params.domainId)}/verify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
    }
  )

  const responseText = await response.text()
  const payload = parseJson<{ error?: ResendApiError }>(responseText)

  if (!response.ok) {
    throw new Error(resolveResendErrorMessage(payload, response.status))
  }
}

export async function findResendDomainByName(params: {
  apiKey: string
  domainName: string
}): Promise<ResendDomain | null> {
  const targetDomain = normalizeDomainName(params.domainName)

  if (!targetDomain) {
    return null
  }

  const domains = await listResendDomains({ apiKey: params.apiKey })
  const existing = domains.find(
    (domain) => normalizeDomainName(domain.name) === targetDomain
  )

  if (!existing?.id) {
    return null
  }

  return getResendDomain({ apiKey: params.apiKey, domainId: existing.id })
}

export async function upsertResendDomain(params: {
  apiKey: string
  domainName: string
  region?: string
}): Promise<ResendDomain> {
  const normalizedDomain = normalizeDomainName(params.domainName)

  if (!normalizedDomain) {
    throw new Error("Enter a valid domain before syncing with Resend.")
  }

  const existing = await findResendDomainByName({
    apiKey: params.apiKey,
    domainName: normalizedDomain,
  })

  if (existing?.id) {
    const updateResponse = await fetchResend(
      `${RESEND_API_BASE_URL}/domains/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          capabilities: {
            sending: "enabled",
            receiving: "enabled",
          },
        }),
      }
    )

    if (!updateResponse.ok) {
      const updateText = await updateResponse.text()
      const updatePayload = parseJson<{ error?: ResendApiError }>(updateText)
      throw new Error(resolveResendErrorMessage(updatePayload, updateResponse.status))
    }

    return getResendDomain({ apiKey: params.apiKey, domainId: existing.id })
  }

  const createResponse = await fetchResend(`${RESEND_API_BASE_URL}/domains`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: normalizedDomain,
      region: params.region,
      capabilities: {
        sending: "enabled",
        receiving: "enabled",
      },
    }),
  })

  const createText = await createResponse.text()
  const createPayload = parseJson<ResendDomainResponse>(createText)

  if (!createResponse.ok) {
    throw new Error(resolveResendErrorMessage(createPayload, createResponse.status))
  }

  if (!createPayload?.id) {
    throw new Error("Resend domain create response did not include an id.")
  }

  return getResendDomain({ apiKey: params.apiKey, domainId: createPayload.id })
}

export async function listResendWebhooks(params: { apiKey: string }): Promise<ResendWebhook[]> {
  const response = await fetchResend(`${RESEND_API_BASE_URL}/webhooks`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    cache: "no-store",
  })

  const responseText = await response.text()
  const payload = parseJson<ResendWebhookListResponse>(responseText)

  if (!response.ok) {
    throw new Error(resolveResendErrorMessage(payload, response.status))
  }

  return payload?.data ?? []
}

export async function ensureResendWebhook(params: {
  apiKey: string
  endpoint: string
  events: string[]
}): Promise<ResendWebhook> {
  const normalizedEndpoint = params.endpoint.trim()

  if (!normalizedEndpoint) {
    throw new Error("Webhook endpoint is required.")
  }

  const webhooks = await listResendWebhooks({ apiKey: params.apiKey })
  const existing = webhooks.find((entry) => entry.endpoint === normalizedEndpoint)

  if (existing?.id) {
    const response = await fetchResend(
      `${RESEND_API_BASE_URL}/webhooks/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: normalizedEndpoint,
          events: params.events,
          status: "enabled",
        }),
      }
    )

    const responseText = await response.text()
    const payload = parseJson<{ error?: ResendApiError }>(responseText)

    if (!response.ok) {
      throw new Error(resolveResendErrorMessage(payload, response.status))
    }

    return {
      id: existing.id,
      endpoint: normalizedEndpoint,
      events: params.events,
      status: "enabled",
    }
  }

  const createResponse = await fetchResend(`${RESEND_API_BASE_URL}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint: normalizedEndpoint,
      events: params.events,
      status: "enabled",
    }),
  })

  const createText = await createResponse.text()
  const createPayload = parseJson<{ id?: string; error?: ResendApiError }>(createText)

  if (!createResponse.ok) {
    throw new Error(resolveResendErrorMessage(createPayload, createResponse.status))
  }

  if (!createPayload?.id) {
    throw new Error("Resend webhook create response did not include an id.")
  }

  return {
    id: createPayload.id,
    endpoint: normalizedEndpoint,
    events: params.events,
    status: "enabled",
  }
}

export function normalizeMessageId(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim()

  if (normalized.length === 0) {
    return null
  }

  const messageIdMatch = normalized.match(/<[^>]+>/)
  if (messageIdMatch?.[0]) {
    return messageIdMatch[0]
  }

  return normalized
}

export function parseMessageIdList(value: string | null | undefined): string[] {
  if (!value) {
    return []
  }

  const normalized = value.trim()

  if (normalized.length === 0) {
    return []
  }

  const bracketedMatches = normalized.match(/<[^>]+>/g)

  if (bracketedMatches && bracketedMatches.length > 0) {
    return Array.from(new Set(bracketedMatches.map((entry) => entry.trim())))
  }

  const pieces = normalized
    .split(/[\s,]+/)
    .map((part) => normalizeMessageId(part))
    .filter((part): part is string => Boolean(part))

  return Array.from(new Set(pieces))
}

export function parseEmailAddress(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim()

  if (!normalized) {
    return null
  }

  const match = normalized.match(/<([^>]+)>/)
  const candidate = (match?.[1] ?? normalized).replace(/^mailto:/i, "").trim()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
    return null
  }

  return candidate.toLowerCase()
}

export function parseDisplayName(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim()

  if (!normalized) {
    return null
  }

  if (normalized.includes("<")) {
    const display = normalized.slice(0, normalized.indexOf("<")).trim()
    return display.length > 0 ? display.replace(/^"|"$/g, "") : null
  }

  return null
}

export function normalizeEmailList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return []
  }

  const addresses = values
    .map((entry) => parseEmailAddress(String(entry)))
    .filter((entry): entry is string => Boolean(entry))

  return Array.from(new Set(addresses))
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
