"use server"

import { redirect } from "next/navigation"

import { getSupabaseServerClient } from "@/lib/supabase/server"

function withError(message: string): string {
  return `/sign-in?error=${encodeURIComponent(message)}`
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function signInWithPasswordAction(formData: FormData) {
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

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect(withError("Invalid email or password."))
  }

  redirect("/dashboard")
}
