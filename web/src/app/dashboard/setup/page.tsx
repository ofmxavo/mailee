import { AutoDnsRefresh } from "@/components/dashboard/auto-dns-refresh"
import { ClickToCopyText } from "@/components/dashboard/click-to-copy-text"
import { EmailIdentityForm } from "@/components/dashboard/email-identity-form"
import { FormSubmitButton } from "@/components/dashboard/form-submit-button"
import { SetupUrlCleaner } from "@/components/dashboard/setup-url-cleaner"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDashboardContext } from "@/lib/dashboard-context"
import {
  checkRequiredDnsRecords,
  findDnsConflicts,
  type DnsConflict,
  type DnsRequirementStatus,
} from "@/lib/dns-diagnostics"
import { getResendApiKey } from "@/lib/env"
import { findResendDomainByName, type ResendDomain } from "@/lib/resend"

import {
  refreshResendDomainStatusAction,
  saveSetupConfigAction,
  syncResendDomainAction,
} from "./actions"

type SetupPageProps = {
  searchParams: Promise<{
    success?: string
    error?: string
    warning?: string
    scope?: "page" | "connect"
  }>
}

type InboxConfigRow = {
  from_email: string
  domain: string | null
  domain_status: string
  reply_to_email: string | null
}

type OrganizationSettingsRow = {
  website_url: string | null
}

function getStatusLabel(active: boolean): "default" | "secondary" | "outline" {
  return active ? "default" : "outline"
}

function getPendingBadgeClass() {
  return "border-amber-400/70 bg-amber-50 text-amber-800"
}

function getErrorBadgeClass() {
  return "border-destructive/40 bg-destructive/5 text-destructive"
}

function getNoticeTone(payload: {
  success?: string
  error?: string
  warning?: string
}): { type: "success" | "error" | "warning"; message: string } | null {
  if (payload.error) {
    return { type: "error", message: payload.error }
  }

  if (payload.warning) {
    return { type: "warning", message: payload.warning }
  }

  if (payload.success) {
    return { type: "success", message: payload.success }
  }

  return null
}

function deriveDomainFromEmail(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()
  const atIndex = normalized.lastIndexOf("@")

  if (atIndex <= 0 || atIndex >= normalized.length - 1) {
    return null
  }

  return normalized.slice(atIndex + 1)
}

function deriveLocalPartFromEmail(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase()
  const atIndex = normalized.lastIndexOf("@")

  if (atIndex <= 0) {
    return null
  }

  return normalized.slice(0, atIndex)
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

function normalizeHostName(value: string): string {
  return value.replace(/\.$/, "").toLowerCase()
}

function resolveRecordHost(domainName: string, recordName: string): string {
  const normalizedDomain = normalizeHostName(domainName)
  const normalizedRecord = normalizeHostName(recordName)

  if (!normalizedRecord || normalizedRecord === "@") {
    return normalizedDomain
  }

  if (normalizedRecord === normalizedDomain || normalizedRecord.endsWith(`.${normalizedDomain}`)) {
    return normalizedRecord
  }

  const domainLabels = normalizedDomain.split(".").filter(Boolean)

  if (domainLabels.length >= 2) {
    const apexDomain = domainLabels.slice(-2).join(".")
    const relativeDomain = domainLabels.slice(0, -2).join(".")

    if (normalizedRecord === apexDomain || normalizedRecord.endsWith(`.${apexDomain}`)) {
      return normalizedRecord
    }

    if (
      relativeDomain &&
      (normalizedRecord === relativeDomain || normalizedRecord.endsWith(`.${relativeDomain}`))
    ) {
      return `${normalizedRecord}.${apexDomain}`
    }
  }

  return `${normalizedRecord}.${normalizedDomain}`
}

function getDnsHostDisplay(domainName: string, recordName: string): { label: string; fqdn: string } {
  const label = recordName.trim().length > 0 ? recordName.trim() : "@"
  const fqdn = resolveRecordHost(domainName, label)

  return { label, fqdn }
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const { success, error, warning, scope } = await searchParams
  const { supabase, organization } = await getDashboardContext()

  const [inboxResponse, settingsResponse] = await Promise.all([
    supabase
      .from("inboxes")
      .select("from_email, domain, domain_status, reply_to_email")
      .eq("organization_id", organization.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("organization_settings")
      .select("website_url")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ])

  const inbox = (inboxResponse.data ?? null) as InboxConfigRow | null
  const settings = (settingsResponse.data ?? null) as OrganizationSettingsRow | null

  const senderReady = Boolean(inbox?.from_email)
  const resolvedDomain = toSendingDomain(inbox?.domain ?? deriveDomainFromEmail(inbox?.from_email))
  const senderLocalPart = deriveLocalPartFromEmail(inbox?.from_email) ?? "support"
  const domainReady = Boolean(resolvedDomain)

  const serviceConfigured = Boolean(getResendApiKey())

  let providerDomain: ResendDomain | null = null
  let providerDomainError: string | null = null
  let dnsConflicts: DnsConflict[] = []
  let dnsRequirementStatuses: DnsRequirementStatus[] = []

  if (serviceConfigured && resolvedDomain) {
    try {
      providerDomain = await findResendDomainByName({
        apiKey: getResendApiKey() as string,
        domainName: resolvedDomain,
      })

      if (providerDomain) {
        const requiredRecords = providerDomain.records ?? []

        ;[dnsConflicts, dnsRequirementStatuses] = await Promise.all([
          findDnsConflicts({
            domainName: providerDomain.name,
            records: requiredRecords,
          }),
          checkRequiredDnsRecords({
            domainName: providerDomain.name,
            records: requiredRecords,
          }),
        ])
      }
    } catch (domainError) {
      providerDomainError =
        domainError instanceof Error ? domainError.message : "Unable to load domain status."
    }
  }

  const dnsVerified =
    inbox?.domain_status === "verified" || providerDomain?.status?.toLowerCase() === "verified"

  const dnsRecords = providerDomain?.records ?? []
  const pendingRecords = dnsRecords.filter(
    (record) => String(record.status ?? "").toLowerCase() !== "verified"
  )

  const senderValue = String(inbox?.from_email ?? "").trim().toLowerCase()
  const hasRealSender = senderValue.length > 0 && !senderValue.endsWith("@mailee.local")
  const hasWebsite = Boolean(String(settings?.website_url ?? "").trim())
  const setupReady = hasRealSender && domainReady && hasWebsite

  const pageNotice = scope === "connect" ? null : getNoticeTone({ success, error, warning })
  const connectNotice = scope === "connect" ? getNoticeTone({ success, error, warning }) : null

  const hasDnsConflicts = dnsConflicts.length > 0
  const highRiskConflictCount = dnsConflicts.filter((entry) => entry.risk === "high").length
  const requiredDnsComplete =
    dnsRequirementStatuses.length > 0 && dnsRequirementStatuses.every((entry) => entry.present)
  const missingRequiredDns = dnsRequirementStatuses.filter((entry) => !entry.present)

  return (
    <div className="space-y-6">
      <SetupUrlCleaner />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
        <p className="text-sm text-muted-foreground">
          Configure sender identity and connect your domain for outbound + inbound email.
        </p>
      </header>

      {pageNotice && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            pageNotice.type === "error"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : pageNotice.type === "warning"
                ? "border-amber-400/70 bg-amber-50 text-amber-800"
                : "border-emerald-400/60 bg-emerald-50 text-emerald-700"
          }`}
        >
          {pageNotice.message}
        </p>
      )}

      {!serviceConfigured && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Email service is not configured yet. Contact support.
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Email identity</CardTitle>
            <CardDescription>
              This is the email address your customers will receive messages from.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailIdentityForm
              action={saveSetupConfigAction}
              initialFromEmail={inbox?.from_email ?? null}
              initialDomain={resolvedDomain ?? null}
              initialWebsiteUrl={settings?.website_url ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Readiness checks for your email channel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span>Sender email configured</span>
              <Badge variant={getStatusLabel(senderReady)}>
                {senderReady ? "ready" : "missing"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span>Domain configured</span>
              <Badge variant={getStatusLabel(domainReady)}>{domainReady ? "ready" : "missing"}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span>DNS verification</span>
              <Badge
                variant={dnsVerified ? "default" : "outline"}
                className={dnsVerified ? undefined : getPendingBadgeClass()}
              >
                {dnsVerified ? "verified" : inbox?.domain_status ?? "pending"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span>Inbound replies</span>
              <Badge
                variant={dnsVerified ? "default" : "outline"}
                className={dnsVerified ? undefined : getPendingBadgeClass()}
              >
                {dnsVerified ? "ready" : "pending"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Connect domain</CardTitle>
          <CardDescription>
            Connect your domain and verify DNS from this dashboard. The <code>Connect domain</code>{" "}
            action creates or updates the domain and inbound reply routing in the background.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-md border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            DNS host labels are relative to your zone: <code>send</code> in a <code>startily.io</code>{" "}
            zone means <code>send.startily.io</code>. You do not need to type the full FQDN in most DNS
            providers.
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Save setup with your base domain (we normalize to <code>mail.&lt;base-domain&gt;</code>).</li>
            <li>Click <code>Connect domain</code> to create/update the domain in Resend.</li>
            <li>Add exactly the DNS records shown below, then click <code>Check DNS status</code>.</li>
          </ol>

          {connectNotice && (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                connectNotice.type === "error"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : connectNotice.type === "warning"
                    ? "border-amber-400/70 bg-amber-50 text-amber-800"
                    : "border-emerald-400/60 bg-emerald-50 text-emerald-700"
              }`}
            >
              {connectNotice.message}
            </p>
          )}

          {!setupReady ? (
            <div className="rounded-md border border-amber-400/70 bg-amber-50 px-3 py-2 text-amber-800">
              Complete setup first: sender email, sending domain, and website URL. Then click
              <code>Save setup</code> to unlock domain connection.
            </div>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
                <form action={syncResendDomainAction} className="space-y-2 rounded-md border bg-background p-3">
                  <input type="hidden" name="domain" value={resolvedDomain ?? ""} />
                  <input type="hidden" name="from_email" value={inbox?.from_email ?? ""} />
                  <input type="hidden" name="sender_local_part" value={senderLocalPart} />
                  <p className="text-xs text-muted-foreground">
                    Connect domain after setup is saved. We will validate fields before continuing.
                  </p>
                  <FormSubmitButton
                    idleLabel="Connect domain"
                    loadingLabel="Connecting..."
                    variant="outline"
                    className="w-full"
                  />
                </form>

                <form
                  action={refreshResendDomainStatusAction}
                  className="space-y-2 rounded-md border bg-background p-3"
                >
                  <input type="hidden" name="domain" value={resolvedDomain ?? ""} />
                  <input type="hidden" name="from_email" value={inbox?.from_email ?? ""} />
                  <input type="hidden" name="sender_local_part" value={senderLocalPart} />
                  <p className="text-xs text-muted-foreground">
                    Run a DNS verification check now. DNS propagation can take a few minutes
                    (sometimes longer).
                  </p>
                  <FormSubmitButton
                    idleLabel="Check DNS status"
                    loadingLabel="Checking DNS..."
                    variant="outline"
                    className="w-full"
                  />
                </form>
              </div>

              <AutoDnsRefresh enabled={!dnsVerified && Boolean(providerDomain)} intervalSeconds={20} />

              {providerDomainError && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
                  {providerDomainError}
                </p>
              )}

              {!providerDomain && resolvedDomain && !providerDomainError && (
                <p className="rounded-md border border-amber-400/70 bg-amber-50 px-3 py-2 text-amber-800">
                  Domain <code>{resolvedDomain}</code> is not connected yet. Click{" "}
                  <code>Connect domain</code>.
                </p>
              )}

              {providerDomain && (
                <div className="space-y-3 rounded-md border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      Domain <code>{providerDomain.name}</code>
                    </p>
                    <Badge
                      variant={providerDomain.status.toLowerCase() === "verified" ? "default" : "outline"}
                      className={
                        providerDomain.status.toLowerCase() === "verified"
                          ? undefined
                          : getPendingBadgeClass()
                      }
                    >
                      {providerDomain.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    DNS records ({dnsRecords.length}) | Pending verification ({pendingRecords.length}) | Click
                    any host or value to copy
                  </p>

                  {requiredDnsComplete && !hasDnsConflicts && providerDomain.status.toLowerCase() !== "verified" && (
                    <p className="rounded-md border border-amber-400/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Live DNS checks are passing, but provider verification is still pending. No conflicting
                      records detected right now. This is usually provider-side propagation/verification delay.
                    </p>
                  )}

                  {missingRequiredDns.length > 0 && (
                    <div className="space-y-2 rounded-md border border-amber-400/70 bg-amber-50 p-3 text-xs text-amber-800">
                      <p className="font-medium">
                        Missing required DNS records detected ({missingRequiredDns.length}).
                      </p>
                      <ul className="list-disc space-y-1 pl-4">
                        {missingRequiredDns.map((entry, index) => (
                          <li key={`${entry.type}-${entry.host}-${index}`} className="break-all">
                            <code className="break-all">{entry.type}</code>{" "}
                            <code className="break-all">{entry.host}</code> {"->"}{" "}
                            <code className="break-all">{entry.value}</code>
                            {entry.priority ? ` (priority ${entry.priority})` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {hasDnsConflicts && (
                    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                      <p className="font-medium">
                        Conflicting DNS records detected ({dnsConflicts.length}) - delete these records to
                        continue verification.
                      </p>
                      {highRiskConflictCount > 0 && (
                        <p className="text-[11px]">
                          {highRiskConflictCount} change(s) are high risk and may impact existing mailbox
                          delivery on this domain.
                        </p>
                      )}
                      <div className="overflow-x-auto rounded-md border bg-background">
                        <table className="w-full min-w-[760px] text-xs text-foreground">
                          <thead className="bg-muted/40 text-left text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">Delete record type</th>
                              <th className="px-3 py-2 font-medium">Host</th>
                              <th className="px-3 py-2 font-medium">Value</th>
                              <th className="px-3 py-2 font-medium">Priority</th>
                              <th className="px-3 py-2 font-medium">Risk</th>
                              <th className="px-3 py-2 font-medium">Why</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dnsConflicts.map((entry, index) => (
                              <tr key={`${entry.type}-${entry.host}-${entry.value}-${index}`} className="border-t align-top">
                                <td className="px-3 py-2">{entry.type}</td>
                                <td className="px-3 py-2">
                                  <ClickToCopyText value={entry.host} />
                                </td>
                                <td className="max-w-[300px] px-3 py-2">
                                  <ClickToCopyText value={entry.value} />
                                </td>
                                <td className="px-3 py-2">{entry.priority ?? "-"}</td>
                                <td className="px-3 py-2">
                                  <Badge
                                    variant="outline"
                                    className={
                                      entry.risk === "high"
                                        ? getErrorBadgeClass()
                                        : getPendingBadgeClass()
                                    }
                                  >
                                    {entry.risk}
                                  </Badge>
                                </td>
                                <td className="max-w-[260px] px-3 py-2 text-muted-foreground">
                                  {entry.reason}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {dnsRecords.length > 0 && (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[760px] text-xs">
                        <thead className="bg-muted/40 text-left text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Record</th>
                            <th className="px-3 py-2 font-medium">Host</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                            <th className="px-3 py-2 font-medium">Priority</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dnsRecords.map((record, index) => {
                            const statusValue = String(record.status ?? "").toLowerCase()
                            const verified = statusValue === "verified"
                            const failed = statusValue.includes("fail")
                            const hostDisplay = getDnsHostDisplay(providerDomain.name, record.name || "@")

                            return (
                              <tr key={`${record.record}-${record.name}-${index}`} className="border-t align-top">
                                <td className="px-3 py-2">{record.type}</td>
                                <td className="px-3 py-2">
                                  <div className="space-y-1">
                                    <div>
                                      <ClickToCopyText value={hostDisplay.label} />
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">
                                      FQDN: <ClickToCopyText value={hostDisplay.fqdn} />
                                    </div>
                                  </div>
                                </td>
                                <td className="max-w-[360px] px-3 py-2">
                                  <ClickToCopyText value={record.value} />
                                </td>
                                <td className="px-3 py-2">{record.priority ?? "-"}</td>
                                <td className="px-3 py-2">
                                  <Badge
                                    variant={verified ? "default" : "outline"}
                                    className={
                                      verified
                                        ? undefined
                                        : failed
                                          ? getErrorBadgeClass()
                                          : getPendingBadgeClass()
                                    }
                                  >
                                    {record.status}
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {pendingRecords.length === 0 && dnsRecords.length > 0 && (
                    <p className="rounded-md border border-emerald-400/60 bg-emerald-50 px-3 py-2 text-emerald-700">
                      All DNS records are verified.
                    </p>
                  )}
                </div>
              )}

              {inbox?.reply_to_email && (
                <p className="text-xs">
                  Reply-to currently configured: <code>{inbox.reply_to_email}</code>
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

