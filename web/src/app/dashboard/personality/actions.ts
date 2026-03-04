"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getDashboardContext } from "@/lib/dashboard-context"

function redirectWithNotice(type: "success" | "error", message: string): never {
  redirect(`/dashboard/personality?${type}=${encodeURIComponent(message)}`)
}

function parseTagList(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

export async function savePersonalitySettingsAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const replyStyle = String(formData.get("reply_style") ?? "").trim()
  const companySummary = String(formData.get("company_summary") ?? "").trim()

  if (replyStyle.length > 2000) {
    redirectWithNotice("error", "Reply style must be 2000 characters or less.")
  }

  if (companySummary.length > 5000) {
    redirectWithNotice("error", "Company summary must be 5000 characters or less.")
  }

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: organization.id,
      reply_style: replyStyle.length > 0 ? replyStyle : null,
      company_summary: companySummary.length > 0 ? companySummary : null,
    },
    {
      onConflict: "organization_id",
    }
  )

  if (error) {
    redirectWithNotice("error", "Unable to save personality settings.")
  }

  revalidatePath("/dashboard/personality")
  redirectWithNotice("success", "Personality settings saved.")
}

export async function addFaqAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const question = String(formData.get("question") ?? "").trim()
  const answer = String(formData.get("answer") ?? "").trim()
  const tagsRaw = String(formData.get("tags") ?? "").trim()

  if (question.length < 3) {
    redirectWithNotice("error", "Question must be at least 3 characters.")
  }

  if (answer.length < 3) {
    redirectWithNotice("error", "Answer must be at least 3 characters.")
  }

  const { error } = await supabase.from("organization_faqs").insert({
    organization_id: organization.id,
    question,
    answer,
    tags: parseTagList(tagsRaw),
    is_active: true,
  })

  if (error) {
    redirectWithNotice("error", "Unable to add FAQ.")
  }

  revalidatePath("/dashboard/personality")
  redirectWithNotice("success", "FAQ added.")
}

export async function addOfferAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const name = String(formData.get("name") ?? "").trim()
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase()
  const offerType = String(formData.get("offer_type") ?? "custom").trim()
  const valueText = String(formData.get("value_text") ?? "").trim()
  const terms = String(formData.get("terms") ?? "").trim()

  if (name.length < 2) {
    redirectWithNotice("error", "Offer name must be at least 2 characters.")
  }

  if (!["percent", "fixed", "trial_extension", "custom"].includes(offerType)) {
    redirectWithNotice("error", "Invalid offer type.")
  }

  const { error } = await supabase.from("organization_offers").insert({
    organization_id: organization.id,
    name,
    code: code.length > 0 ? code : null,
    offer_type: offerType,
    value_text: valueText.length > 0 ? valueText : null,
    terms: terms.length > 0 ? terms : null,
    is_active: true,
  })

  if (error) {
    redirectWithNotice("error", "Unable to add offer.")
  }

  revalidatePath("/dashboard/personality")
  redirectWithNotice("success", "Offer added.")
}

export async function addGoalAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const key = String(formData.get("key") ?? "")
    .trim()
    .toLowerCase()
  const label = String(formData.get("label") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()

  if (!/^[a-z0-9_\-]{2,80}$/.test(key)) {
    redirectWithNotice(
      "error",
      "Goal key must be 2-80 chars with letters, numbers, dashes, or underscores."
    )
  }

  if (label.length < 2) {
    redirectWithNotice("error", "Goal label must be at least 2 characters.")
  }

  const { error } = await supabase.from("organization_goals").insert({
    organization_id: organization.id,
    key,
    label,
    description: description.length > 0 ? description : null,
    is_active: true,
  })

  if (error?.code === "23505") {
    redirectWithNotice("error", "A goal with this key already exists.")
  }

  if (error) {
    redirectWithNotice("error", "Unable to add goal.")
  }

  revalidatePath("/dashboard/personality")
  redirectWithNotice("success", "Goal added.")
}
