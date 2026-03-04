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

import { signUpWithPasswordAction } from "./actions"

type SignUpPageProps = {
  searchParams: Promise<{
    error?: string
  }>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { error } = await searchParams
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
              Create your Mailee account
            </CardTitle>
            <CardDescription>
              Start with your email and password. You can configure your workspace
              after sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <form action={signUpWithPasswordAction} className="space-y-3">
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
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              <Button type="submit" className="w-full">
                Create account
              </Button>
            </form>

            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-primary hover:underline">
                Sign in
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
