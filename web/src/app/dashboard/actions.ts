"use server"

import { redirect } from "next/navigation"

import { getSupabaseServerClient } from "@/lib/supabase/server"

export async function signOutAction() {
  const supabase = await getSupabaseServerClient()

  if (supabase) {
    await supabase.auth.signOut()
  }

  redirect("/sign-in")
}
