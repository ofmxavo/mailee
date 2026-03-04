"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getDashboardContext } from "@/lib/dashboard-context"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function redirectWithNotice(type: "success" | "error", message: string): never {
  redirect(`/dashboard/contacts?${type}=${encodeURIComponent(message)}`)
}

export async function createContactAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const fullNameValue = String(formData.get("full_name") ?? "").trim()

  if (!EMAIL_PATTERN.test(email)) {
    redirectWithNotice("error", "Enter a valid contact email.")
  }

  if (fullNameValue.length > 120) {
    redirectWithNotice("error", "Full name must be 120 characters or less.")
  }

  const { error } = await supabase.from("contacts").insert({
    organization_id: organization.id,
    email,
    full_name: fullNameValue.length > 0 ? fullNameValue : null,
  })

  if (error?.code === "23505") {
    redirectWithNotice("error", "A contact with that email already exists.")
  }

  if (error) {
    redirectWithNotice("error", "Unable to create contact right now.")
  }

  revalidatePath("/dashboard/contacts")
  redirectWithNotice("success", "Contact created.")
}
