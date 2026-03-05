import { Database, Link2, Users } from "lucide-react"

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

import { uploadUsersCsvAction } from "./actions"

type UsersPageProps = {
  searchParams: Promise<{
    success?: string
    error?: string
  }>
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

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const { success, error } = await searchParams
  const { supabase, organization } = await getDashboardContext()

  const [contactsResponse, activeConversationsResponse] = await Promise.all([
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .neq("status", "closed"),
  ])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Bring user data into Mailee so AI can time upsells, pauses, and reactivation nudges correctly.
        </p>
      </header>

      {(success || error) && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-emerald-400/60 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? success}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Known users"
          value={String(contactsResponse.count ?? 0)}
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
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
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
              This upload currently validates and previews row count. Persisted import + dedupe queue is
              next.
            </p>
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
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recommended flow</CardTitle>
          <CardDescription>
            Rollout order for turning user data into controlled upsell automation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Upload CSV baseline so AI has user context from day one.</p>
          <p>2. Connect one source of truth first (usually Stripe) for spend + plan changes.</p>
          <p>3. Write playbook rules: who to upsell, when to pause, and what success means.</p>
          <p>4. Store every upsell attempt/outcome as lifecycle events for future decisions.</p>
        </CardContent>
      </Card>
    </div>
  )
}
