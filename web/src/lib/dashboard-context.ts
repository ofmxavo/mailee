import type { SupabaseClient, User } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { getSupabaseServerClient } from "@/lib/supabase/server"

type OrganizationSummary = {
  id: string
  name: string
}

export type DashboardContext = {
  supabase: SupabaseClient
  user: User
  organization: OrganizationSummary
}

function buildDefaultOrganizationSlug(userId: string): string {
  return `user-${userId}`
}

function buildDefaultOrganizationName(user: User): string {
  const rawName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : ""

  if (rawName.length > 0) {
    return `${rawName}'s Workspace`
  }

  const emailPrefix = user.email?.split("@")[0]?.trim()

  if (emailPrefix && emailPrefix.length > 0) {
    return `${emailPrefix}'s Workspace`
  }

  return "My Workspace"
}

async function findOrganizationForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<OrganizationSummary | null> {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new Error(`Unable to load organization membership: ${membershipError.message}`)
  }

  if (!membership) {
    return null
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", membership.organization_id)
    .maybeSingle()

  if (organizationError) {
    throw new Error(`Unable to load organization: ${organizationError.message}`)
  }

  if (!organization) {
    return {
      id: membership.organization_id,
      name: "Workspace",
    }
  }

  return organization
}

async function ensureDefaultOrganization(
  supabase: SupabaseClient,
  user: User
): Promise<OrganizationSummary> {
  const slug = buildDefaultOrganizationSlug(user.id)

  const { data: existingBySlug, error: existingBySlugError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle()

  if (existingBySlugError) {
    throw new Error(
      `Unable to check default organization: ${existingBySlugError.message}`
    )
  }

  let organization = existingBySlug

  if (!organization) {
    const { data: created, error: createError } = await supabase
      .from("organizations")
      .insert({
        slug,
        name: buildDefaultOrganizationName(user),
      })
      .select("id, name")
      .single()

    if (createError && createError.code !== "23505") {
      throw new Error(`Unable to create default organization: ${createError.message}`)
    }

    if (createError?.code === "23505") {
      const { data: fromRetry, error: retryError } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("slug", slug)
        .single()

      if (retryError) {
        throw new Error(`Unable to load default organization: ${retryError.message}`)
      }

      organization = fromRetry
    } else {
      organization = created
    }
  }

  if (!organization) {
    throw new Error("Unable to resolve default organization.")
  }

  const { error: membershipInsertError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: organization.id,
      user_id: user.id,
      role: "owner",
    })

  if (membershipInsertError && membershipInsertError.code !== "23505") {
    throw new Error(
      `Unable to create default organization membership: ${membershipInsertError.message}`
    )
  }

  return organization
}

export async function getDashboardContext(): Promise<DashboardContext> {
  const supabase = await getSupabaseServerClient()

  if (!supabase) {
    redirect("/sign-in?error=Supabase%20is%20not%20configured")
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/sign-in")
  }

  const existingOrganization = await findOrganizationForUser(supabase, user.id)

  const organization =
    existingOrganization ?? (await ensureDefaultOrganization(supabase, user))

  return {
    supabase,
    user,
    organization,
  }
}
