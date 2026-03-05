"use client"

import { useMemo, useState } from "react"

import { FormSubmitButton } from "@/components/dashboard/form-submit-button"
import { Input } from "@/components/ui/input"

type EmailIdentityFormProps = {
  action: (formData: FormData) => void
  initialFromEmail: string | null
  initialDomain: string | null
  initialWebsiteUrl: string | null
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

function toSendingDomain(value: string | null | undefined): string | null {
  const normalized = normalizeDomainValue(value)

  if (!normalized) {
    return null
  }

  return normalized.startsWith("mail.") ? normalized : `mail.${normalized}`
}

function toBaseDomain(value: string | null | undefined): string {
  const normalized = normalizeDomainValue(value)

  if (!normalized) {
    return ""
  }

  return normalized.startsWith("mail.") ? normalized.slice("mail.".length) : normalized
}

function deriveLocalPartFromEmail(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase()
  const atIndex = normalized.lastIndexOf("@")

  if (atIndex <= 0) {
    return "support"
  }

  return normalized.slice(0, atIndex)
}

function normalizeLocalPart(value: string): string {
  const normalized = value.trim().toLowerCase()
  const local = normalized.includes("@") ? normalized.split("@")[0] : normalized

  return local.replace(/\s+/g, "")
}

export function EmailIdentityForm({
  action,
  initialFromEmail,
  initialDomain,
  initialWebsiteUrl,
}: EmailIdentityFormProps) {
  const [domainBase, setDomainBase] = useState<string>(toBaseDomain(initialDomain))
  const [senderLocalPart, setSenderLocalPart] = useState<string>(
    deriveLocalPartFromEmail(initialFromEmail)
  )

  const normalizedSendingDomain = useMemo(() => toSendingDomain(domainBase), [domainBase])
  const sendingDomain = normalizedSendingDomain ?? "mail.yourdomain.com"

  const fullSender = useMemo(() => {
    const localPart = normalizeLocalPart(senderLocalPart)
    return `${localPart.length > 0 ? localPart : "support"}@${sendingDomain}`
  }, [senderLocalPart, sendingDomain])

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="provider" value="resend" />
      <input type="hidden" name="from_email" value={normalizedSendingDomain ? fullSender : ""} />

      <div className="space-y-1.5">
        <label htmlFor="domain" className="text-sm font-medium">
          Sending domain
        </label>
        <Input
          id="domain"
          name="domain"
          placeholder="startily.io"
          value={domainBase}
          onChange={(event) => setDomainBase(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Enter your base domain. We automatically use <code>mail.&lt;base-domain&gt;</code> for sending.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sender_local_part" className="text-sm font-medium">
          Sender email
        </label>
        <div className="flex items-center gap-2 rounded-md border px-2">
          <Input
            id="sender_local_part"
            name="sender_local_part"
            placeholder="support"
            value={senderLocalPart}
            onChange={(event) => setSenderLocalPart(normalizeLocalPart(event.target.value))}
            className="border-0 shadow-none focus-visible:ring-0"
          />
          <span className="shrink-0 text-xs text-muted-foreground">@{sendingDomain}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          This is the email address your customers will receive messages from.
        </p>
      </div>

      <div className="space-y-1.5 md:col-span-2">
        <label htmlFor="website_url" className="text-sm font-medium">
          Website URL
        </label>
        <Input
          id="website_url"
          name="website_url"
          placeholder="https://yourdomain.com"
          defaultValue={initialWebsiteUrl ?? ""}
        />
      </div>

      <div className="md:col-span-2 flex items-center justify-end gap-2">
        <FormSubmitButton idleLabel="Save setup" loadingLabel="Saving..." />
      </div>
    </form>
  )
}
