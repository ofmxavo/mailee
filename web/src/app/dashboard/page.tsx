import { AlertTriangle, Inbox, Sparkles, TrendingUp } from "lucide-react"

import { MetricCard } from "@/components/dashboard/metric-card"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDashboardContext } from "@/lib/dashboard-context"

const eventBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  feedback: "secondary",
  feature_request: "default",
  discount_sent: "outline",
  upsell_won: "default",
  user_recovered: "secondary",
  demo_booked: "default",
  trial_started: "outline",
  needs_human: "secondary",
  other: "outline",
}

type ConversationEventRow = {
  id: string
  event_type: keyof typeof eventBadgeVariant
  title: string
  details: string | null
  occurred_at: string
}

export default async function DashboardPage() {
  const { supabase, organization } = await getDashboardContext()

  const [
    activeConversationsResponse,
    needsHumanResponse,
    featureRequestsResponse,
    recoveredUsersResponse,
    latestEventsResponse,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .neq("status", "closed"),
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("needs_human_reply", true),
    supabase
      .from("conversation_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("event_type", "feature_request"),
    supabase
      .from("conversation_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("event_type", "user_recovered"),
    supabase
      .from("conversation_events")
      .select("id, event_type, title, details, occurred_at")
      .eq("organization_id", organization.id)
      .order("occurred_at", { ascending: false })
      .limit(10),
  ])

  const events = (latestEventsResponse.data ?? []) as ConversationEventRow[]

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of inbox volume, handoff risk, and customer outcomes.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Active conversations"
          value={String(activeConversationsResponse.count ?? 0)}
          detail="Open + pending threads"
          icon={Inbox}
        />
        <MetricCard
          title="Needs human reply"
          value={String(needsHumanResponse.count ?? 0)}
          detail="Flagged for manual follow-up"
          icon={AlertTriangle}
        />
        <MetricCard
          title="Feature requests"
          value={String(featureRequestsResponse.count ?? 0)}
          detail="Captured from conversation events"
          icon={Sparkles}
        />
        <MetricCard
          title="Recovered users"
          value={String(recoveredUsersResponse.count ?? 0)}
          detail="event_type = user_recovered"
          icon={TrendingUp}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Latest conversation events</CardTitle>
          <CardDescription>
            Last 10 event/action items extracted from threads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.length === 0 && (
            <p className="rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
              No events captured yet.
            </p>
          )}

          {events.map((event) => (
            <div key={event.id} className="rounded-lg border bg-background p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Badge variant={eventBadgeVariant[event.event_type] ?? "outline"}>
                  {event.event_type.replace("_", " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.occurred_at).toLocaleString()}
                </span>
              </div>
              <p className="font-medium">{event.title}</p>
              {event.details && (
                <p className="mt-1 text-muted-foreground">{event.details}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
