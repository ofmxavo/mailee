import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getDashboardContext } from "@/lib/dashboard-context"

import {
  addFaqAction,
  addGoalAction,
  addOfferAction,
  savePersonalitySettingsAction,
} from "./actions"

type PersonalityPageProps = {
  searchParams: Promise<{
    success?: string
    error?: string
  }>
}

type OrganizationSettingsRow = {
  reply_style: string | null
  company_summary: string | null
}

type FaqRow = {
  id: string
  question: string
  answer: string
  tags: string[] | null
  is_active: boolean
}

type OfferRow = {
  id: string
  name: string
  code: string | null
  offer_type: "percent" | "fixed" | "trial_extension" | "custom"
  value_text: string | null
  terms: string | null
  is_active: boolean
}

type GoalRow = {
  id: string
  key: string
  label: string
  description: string | null
  is_active: boolean
}

export default async function PersonalityPage({ searchParams }: PersonalityPageProps) {
  const { success, error } = await searchParams
  const { supabase, organization } = await getDashboardContext()

  const [settingsResponse, faqsResponse, offersResponse, goalsResponse] =
    await Promise.all([
      supabase
        .from("organization_settings")
        .select("reply_style, company_summary")
        .eq("organization_id", organization.id)
        .maybeSingle(),
      supabase
        .from("organization_faqs")
        .select("id, question, answer, tags, is_active")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("organization_offers")
        .select("id, name, code, offer_type, value_text, terms, is_active")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("organization_goals")
        .select("id, key, label, description, is_active")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ])

  const settings = (settingsResponse.data ?? null) as OrganizationSettingsRow | null
  const faqs = (faqsResponse.data ?? []) as FaqRow[]
  const offers = (offersResponse.data ?? []) as OfferRow[]
  const goals = (goalsResponse.data ?? []) as GoalRow[]

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Personality</h1>
        <p className="text-sm text-muted-foreground">
          Tune how Mailee responds and manage reusable FAQ, offer, and goal
          presets.
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

      <Card>
        <CardHeader>
          <CardTitle>Core reply behavior</CardTitle>
          <CardDescription>
            These settings shape default tone and context for generated replies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={savePersonalitySettingsAction} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="reply_style" className="text-sm font-medium">
                Reply style
              </label>
              <Input
                id="reply_style"
                name="reply_style"
                placeholder="Warm, concise, and solution-oriented"
                defaultValue={settings?.reply_style ?? ""}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="company_summary" className="text-sm font-medium">
                Company summary
              </label>
              <Textarea
                id="company_summary"
                name="company_summary"
                className="min-h-24"
                placeholder="Describe your product and ideal customer in 2-4 lines."
                defaultValue={settings?.company_summary ?? ""}
              />
            </div>

            <Button type="submit">Save personality settings</Button>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>FAQ knowledge base</CardTitle>
            <CardDescription>Add a reusable answer for common questions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={addFaqAction} className="space-y-2">
              <Input name="question" placeholder="Question" minLength={3} required />
              <Textarea
                name="answer"
                className="min-h-20"
                placeholder="Answer"
                minLength={3}
                required
              />
              <Input name="tags" placeholder="Tags (comma-separated)" />
              <Button type="submit" size="sm">
                Add FAQ
              </Button>
            </form>

            <div className="space-y-2">
              {faqs.length === 0 && (
                <p className="text-sm text-muted-foreground">No FAQs yet.</p>
              )}
              {faqs.map((faq) => (
                <div key={faq.id} className="rounded-md border bg-background p-3 text-sm">
                  <p className="font-medium">{faq.question}</p>
                  <p className="mt-1 text-muted-foreground">{faq.answer}</p>
                  {faq.tags && faq.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {faq.tags.map((tag) => (
                        <Badge key={`${faq.id}-${tag}`} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offers & discounts</CardTitle>
            <CardDescription>
              Define promotion snippets Mailee can reference.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={addOfferAction} className="space-y-2">
              <Input name="name" placeholder="Offer name" minLength={2} required />
              <Input name="code" placeholder="Code (optional)" />
              <select
                name="offer_type"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue="custom"
              >
                <option value="custom">custom</option>
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
                <option value="trial_extension">trial_extension</option>
              </select>
              <Input name="value_text" placeholder="Value text (e.g. 20% off)" />
              <Textarea name="terms" placeholder="Terms (optional)" className="min-h-16" />
              <Button type="submit" size="sm">
                Add offer
              </Button>
            </form>

            <div className="space-y-2">
              {offers.length === 0 && (
                <p className="text-sm text-muted-foreground">No offers yet.</p>
              )}
              {offers.map((offer) => (
                <div key={offer.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{offer.name}</p>
                    <Badge variant="outline">{offer.offer_type}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {offer.code ? `Code: ${offer.code}` : "No code"}
                    {offer.value_text ? ` • ${offer.value_text}` : ""}
                  </p>
                  {offer.terms && <p className="mt-1 text-muted-foreground">{offer.terms}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Goals</CardTitle>
            <CardDescription>
              Save key business outcomes for per-thread goal tagging.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={addGoalAction} className="space-y-2">
              <Input name="key" placeholder="goal_key" pattern="[a-z0-9_\-]{2,80}" required />
              <Input name="label" placeholder="Goal label" minLength={2} required />
              <Textarea
                name="description"
                placeholder="Description (optional)"
                className="min-h-16"
              />
              <Button type="submit" size="sm">
                Add goal
              </Button>
            </form>

            <div className="space-y-2">
              {goals.length === 0 && (
                <p className="text-sm text-muted-foreground">No goals yet.</p>
              )}
              {goals.map((goal) => (
                <div key={goal.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{goal.label}</p>
                    <Badge variant="outline">{goal.key}</Badge>
                  </div>
                  {goal.description && (
                    <p className="mt-1 text-muted-foreground">{goal.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
