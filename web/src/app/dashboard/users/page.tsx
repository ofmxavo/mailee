import { Database, Link2, Mail, Users } from "lucide-react"

import { FormSubmitButton } from "@/components/dashboard/form-submit-button"
import { MetricCard } from "@/components/dashboard/metric-card"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getDashboardContext } from "@/lib/dashboard-context"

import {
  addManualUserAction,
  openUserThreadAction,
  sendUserIntroNowAction,
  uploadUsersCsvAction,
} from "./actions"

type UsersPageProps = {
  searchParams: Promise<{
    success?: string
    error?: string
    warning?: string
  }>
}

type ContactRow = {
  id: string
  email: string
  full_name: string | null
  company: string | null
  lifecycle_stage: "trial" | "active" | "at_risk" | "churned"
  last_seen_at: string | null
  created_at: string
}

type ConversationRow = {
  id: string
  contact_id: string
  status: "open" | "pending" | "closed"
  last_message_at: string | null
  created_at: string
}

const integrations = [
  {
    key: "stripe",
    name: "Stripe",
    description: "Billing + subscription state for upsell and churn prevention.",
  },
  {
    key: "shopify",
    name: "Shopify",
    description: "Orders, purchase behavior, and re-engagement opportunities.",
  },
  {
    key: "polar",
    name: "Polar",
    description: "Developer-centric billing and entitlement lifecycle events.",
  },
  {
    key: "clerk",
    name: "Clerk",
    description: "Identity lifecycle signals (sign-up, activation, inactivity).",
  },
] as const

function formatDate(value: string | null): string {
  if (!value) {
    return "-"
  }

  return new Date(value).toLocaleString()
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const { success, error, warning } = await searchParams
  const { supabase, organization } = await getDashboardContext()

  const [contactsResponse, activeConversationsResponse, automationModeResponse] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, email, full_name, company, lifecycle_stage, last_seen_at, created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .neq("status", "closed"),
    supabase
      .from("organization_settings")
      .select("default_ai_mode")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ])

  const contacts = (contactsResponse.data ?? []) as ContactRow[]
  const contactIds = contacts.map((entry) => entry.id)

  const latestConversationByContact = new Map<string, ConversationRow>()

  if (contactIds.length > 0) {
    const { data: conversationsData } = await supabase
      .from("conversations")
      .select("id, contact_id, status, last_message_at, created_at")
      .eq("organization_id", organization.id)
      .in("contact_id", contactIds)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    const conversations = (conversationsData ?? []) as ConversationRow[]

    for (const conversation of conversations) {
      if (!latestConversationByContact.has(conversation.contact_id)) {
        latestConversationByContact.set(conversation.contact_id, conversation)
      }
    }
  }

  const automationMode = String(automationModeResponse.data?.default_ai_mode ?? "draft")
    .trim()
    .toLowerCase()
  const automationActive = automationMode === "auto"

  const notice = error ?? warning ?? success
  const noticeType = error ? "error" : warning ? "warning" : success ? "success" : null

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Manage your customer list, start outreach, and inspect user-level email threads.
        </p>
      </header>

      {notice && noticeType && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            noticeType === "error"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : noticeType === "warning"
                ? "border-amber-400/70 bg-amber-50 text-amber-800"
                : "border-emerald-400/60 bg-emerald-50 text-emerald-700"
          }`}
        >
          {notice}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Known users"
          value={String(contacts.length)}
          detail="Contacts available for outreach"
          icon={Users}
        />
        <MetricCard
          title="Active threads"
          value={String(activeConversationsResponse.count ?? 0)}
          detail="Open + pending conversations"
          icon={Link2}
        />
        <MetricCard
          title="Connected sources"
          value="0"
          detail="Stripe / Shopify / Polar / Clerk"
          icon={Database}
        />
        <MetricCard
          title="Automation"
          value={automationActive ? "Active" : "Paused"}
          detail="Email section controls auto outreach behavior"
          icon={Mail}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add user manually</CardTitle>
            <CardDescription>
              Add a single user and optionally trigger intro email if automation is active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addManualUserAction} className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="manual_email" className="text-sm font-medium">
                  Email
                </label>
                <Input id="manual_email" name="email" placeholder="name@company.com" required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="manual_full_name" className="text-sm font-medium">
                  Full name
                </label>
                <Input id="manual_full_name" name="full_name" placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="manual_company" className="text-sm font-medium">
                  Company
                </label>
                <Input id="manual_company" name="company" placeholder="Acme Inc." />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="manual_lifecycle_stage" className="text-sm font-medium">
                  Lifecycle stage
                </label>
                <select
                  id="manual_lifecycle_stage"
                  name="lifecycle_stage"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  defaultValue="trial"
                >
                  <option value="trial">trial</option>
                  <option value="active">active</option>
                  <option value="at_risk">at_risk</option>
                  <option value="churned">churned</option>
                </select>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <FormSubmitButton idleLabel="Add user" loadingLabel="Saving user..." />
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import users from CSV</CardTitle>
            <CardDescription>
              Start with historical users, then keep data fresh via direct integrations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form action={uploadUsersCsvAction} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="users_csv" className="text-sm font-medium">
                  CSV file
                </label>
                <Input id="users_csv" name="users_csv" type="file" accept=".csv,text/csv" />
              </div>
              <p className="text-xs text-muted-foreground">
                Expected columns: <code>email</code> (required), <code>full_name</code>,{" "}
                <code>company</code>, <code>lifecycle_stage</code>, <code>plan</code>,{" "}
                <code>mrr</code>.
              </p>
              <FormSubmitButton idleLabel="Upload CSV" loadingLabel="Parsing CSV..." />
            </form>
            <p className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              CSV upload is parser-only right now. Persisted import + dedupe queue is the next
              backend milestone.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>User table</CardTitle>
          <CardDescription>
            Open each user thread in Inbox or manually send an intro email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
              No users added yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Stage</th>
                    <th className="px-3 py-2 font-medium">Last seen</th>
                    <th className="px-3 py-2 font-medium">Thread</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => {
                    const latestConversation = latestConversationByContact.get(contact.id)
                    return (
                      <tr key={contact.id} className="border-t align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium">{contact.full_name ?? "Unnamed user"}</p>
                          <p className="text-xs text-muted-foreground">{contact.email}</p>
                        </td>
                        <td className="px-3 py-2">{contact.company ?? "-"}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{contact.lifecycle_stage}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatDate(contact.last_seen_at ?? contact.created_at)}
                        </td>
                        <td className="px-3 py-2">
                          {latestConversation ? (
                            <div className="space-y-1">
                              <Badge variant="secondary">{latestConversation.status}</Badge>
                              <p className="text-xs text-muted-foreground">
                                Updated {formatDate(latestConversation.last_message_at ?? latestConversation.created_at)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No thread yet</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <form action={openUserThreadAction}>
                              <input type="hidden" name="contact_id" value={contact.id} />
                              <FormSubmitButton idleLabel="Open thread" loadingLabel="Opening..." variant="outline" />
                            </form>
                            <form action={sendUserIntroNowAction}>
                              <input type="hidden" name="contact_id" value={contact.id} />
                              <FormSubmitButton idleLabel="Send intro" loadingLabel="Sending..." />
                            </form>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data integrations</CardTitle>
          <CardDescription>
            Keep user status and spend data updated automatically for better AI decisions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {integrations.map((integration) => (
            <div key={integration.key} className="rounded-md border bg-background p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-medium">{integration.name}</p>
                <Badge variant="outline">coming soon</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{integration.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
