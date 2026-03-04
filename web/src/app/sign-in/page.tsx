import Link from "next/link"
import { redirect } from "next/navigation"
import { Sparkles } from "lucide-react"

import { MissingEnvNotice } from "@/components/env/missing-env-notice"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getSupabaseServerClient } from "@/lib/supabase/server"

import { signInWithPasswordAction } from "./actions"

type SignInPageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { error, success } = await searchParams
  const supabase = await getSupabaseServerClient()

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      redirect("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10 md:py-16">
      <div className="mx-auto grid w-full max-w-md gap-5">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
              Sign in to Mailee
            </CardTitle>
            <CardDescription>
              Use your email and password to access your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {success && (
              <p className="rounded-md border border-emerald-400/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {success}
              </p>
            )}

            <form action={signInWithPasswordAction} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>

            <p className="text-sm text-muted-foreground">
              New to Mailee?{" "}
              <Link href="/sign-up" className="font-medium text-primary hover:underline">
                Create an account
              </Link>
            </p>

            <Button asChild variant="outline" className="w-full">
              <Link href="/">Back to landing page</Link>
            </Button>
          </CardContent>
        </Card>

        <MissingEnvNotice scope="supabase" />
      </div>
    </div>
  )
}
