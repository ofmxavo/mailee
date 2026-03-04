"use server"

import { redirect } from "next/navigation"

import { getRequestBaseUrl } from "@/lib/site-url"
import { getSupabaseServerClient } from "@/lib/supabase/server"

function withError(message: string): string {
  return `/sign-up?error=${encodeURIComponent(message)}`
}

function withSignInNotice(message: string): string {
  return `/sign-in?success=${encodeURIComponent(message)}`
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function signUpWithPasswordAction(formData: FormData) {
  const supabase = await getSupabaseServerClient()

  if (!supabase) {
    redirect(withError("Supabase is not configured."))
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const password = String(formData.get("password") ?? "").trim()

  if (!isValidEmail(email)) {
    redirect(withError("Enter a valid email address."))
  }

  if (password.length < 8) {
    redirect(withError("Password must be at least 8 characters."))
  }

  const baseUrl = await getRequestBaseUrl()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${baseUrl}/auth/confirm`,
    },
  })

  if (error) {
    redirect(withError(error.message || "Unable to create your account."))
  }

  if (data.session) {
    redirect("/dashboard")
  }

  redirect(
    withSignInNotice(
      "Account created. Check your inbox for a confirmation email, then sign in."
    )
  )
}
