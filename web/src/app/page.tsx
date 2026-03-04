import Link from "next/link"
import { ArrowRight, Mail, ShieldCheck, Sparkles, TrendingUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getSupabaseServerClient } from "@/lib/supabase/server"

const features = [
  {
    icon: Mail,
    title: "Proactive lifecycle outreach",
    description:
      "Automatically start and maintain thoughtful 1:1 email conversations at key moments like signup, day 3, and inactivity.",
  },
  {
    icon: Sparkles,
    title: "Persistent conversation memory",
    description:
      "Track context per contact so each follow-up feels continuous, not template-driven.",
  },
  {
    icon: TrendingUp,
    title: "Actionable retention insights",
    description:
      "Extract churn risk, activation blockers, and upsell signals from every thread.",
  },
  {
    icon: ShieldCheck,
    title: "Human-safe approval controls",
    description:
      "Run in auto-send, review-required, or hybrid mode with full audit visibility.",
  },
]

export default async function Home() {
  const supabase = await getSupabaseServerClient()

  let isAuthenticated = false

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    isAuthenticated = Boolean(user)
  }

  const secondaryHref = isAuthenticated ? "/dashboard" : "/sign-in"
  const secondaryLabel = isAuthenticated ? "Open dashboard" : "Sign in"

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-10 md:px-8 md:py-14">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="font-semibold">Mailee</span>
          </div>
          <Button asChild variant="outline">
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="secondary">AI Customer Concierge by email</Badge>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Turn onboarding emails into retention conversations.
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Mailee helps SaaS teams start proactive, personalized email
                threads with every customer and convert those threads into
                measurable activation and expansion signals.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Create account
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={secondaryHref}>{secondaryLabel}</Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Why teams adopt Mailee</CardTitle>
              <CardDescription>
                Built for product-led B2B SaaS teams that need higher activation,
                better feedback, and less manual follow-up.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• Reach every new signup with a contextual welcome flow.</p>
              <p>• Keep a memory-backed thread per contact and account.</p>
              <p>• Escalate risk and upsell signals to humans in real time.</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  {feature.title}
                </CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </div>
    </div>
  )
}
