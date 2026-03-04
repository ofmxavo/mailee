"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getDashboardContext } from "@/lib/dashboard-context"
import {
  ensureDefaultAgentId,
  ensureDefaultInboxId,
} from "@/lib/dashboard-defaults"

function redirectWithNotice(type: "success" | "error", message: string): never {
  redirect(`/dashboard/inbox?${type}=${encodeURIComponent(message)}`)
}

function redirectWithConversationNotice(
  conversationId: string,
  type: "success" | "error",
  message: string
): never {
  redirect(
    `/dashboard/inbox?conversation=${encodeURIComponent(conversationId)}&${type}=${encodeURIComponent(message)}`
  )
}

export async function createConversationAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const contactId = String(formData.get("contact_id") ?? "").trim()
  const subject = String(formData.get("subject") ?? "").trim()
  const status = String(formData.get("status") ?? "open").trim() || "open"

  if (!contactId) {
    redirectWithNotice("error", "Select a contact for the conversation.")
  }

  if (subject.length < 3 || subject.length > 200) {
    redirectWithNotice("error", "Subject must be between 3 and 200 characters.")
  }

  if (!["open", "pending", "closed"].includes(status)) {
    redirectWithNotice("error", "Invalid conversation status.")
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("organization_id", organization.id)
    .maybeSingle()

  if (contactError) {
    redirectWithNotice("error", "Unable to validate selected contact.")
  }

  if (!contact) {
    redirectWithNotice("error", "Selected contact was not found.")
  }

  try {
    const agentId = await ensureDefaultAgentId(supabase, organization.id)
    const inboxId = await ensureDefaultInboxId(supabase, organization.id, agentId)

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        organization_id: organization.id,
        contact_id: contact.id,
        subject,
        status,
        agent_id: agentId,
        inbox_id: inboxId,
      })
      .select("id")
      .single()

    if (error) {
      redirectWithNotice("error", "Unable to create conversation right now.")
    }

    revalidatePath("/dashboard/inbox")
    redirectWithConversationNotice(created.id, "success", "Conversation created.")
  } catch {
    redirectWithNotice("error", "Unable to create conversation right now.")
  }
}

async function validateConversation(
  conversationId: string,
  organizationId: string,
  supabase: Awaited<ReturnType<typeof getDashboardContext>>["supabase"]
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (error || !data) {
    return false
  }

  return true
}

export async function updateConversationAiModeAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const conversationId = String(formData.get("conversation_id") ?? "").trim()
  const aiMode = String(formData.get("ai_mode") ?? "draft").trim()

  if (!conversationId) {
    redirectWithNotice("error", "Missing conversation.")
  }

  if (!["draft", "auto"].includes(aiMode)) {
    redirectWithConversationNotice(conversationId, "error", "Invalid AI mode.")
  }

  const isValidConversation = await validateConversation(
    conversationId,
    organization.id,
    supabase
  )

  if (!isValidConversation) {
    redirectWithNotice("error", "Conversation not found.")
  }

  const { error } = await supabase
    .from("conversations")
    .update({ ai_mode: aiMode })
    .eq("id", conversationId)
    .eq("organization_id", organization.id)

  if (error) {
    redirectWithConversationNotice(
      conversationId,
      "error",
      "Unable to update AI mode."
    )
  }

  revalidatePath("/dashboard/inbox")
  redirectWithConversationNotice(conversationId, "success", "AI mode updated.")
}

export async function updateConversationPauseAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const conversationId = String(formData.get("conversation_id") ?? "").trim()
  const repliesPaused = String(formData.get("replies_paused") ?? "false") === "true"
  const reason = String(formData.get("replies_paused_reason") ?? "").trim()

  if (!conversationId) {
    redirectWithNotice("error", "Missing conversation.")
  }

  const isValidConversation = await validateConversation(
    conversationId,
    organization.id,
    supabase
  )

  if (!isValidConversation) {
    redirectWithNotice("error", "Conversation not found.")
  }

  const { error } = await supabase
    .from("conversations")
    .update({
      replies_paused: repliesPaused,
      replies_paused_reason: repliesPaused && reason.length > 0 ? reason : null,
    })
    .eq("id", conversationId)
    .eq("organization_id", organization.id)

  if (error) {
    redirectWithConversationNotice(
      conversationId,
      "error",
      "Unable to update pause state."
    )
  }

  revalidatePath("/dashboard/inbox")
  redirectWithConversationNotice(
    conversationId,
    "success",
    repliesPaused ? "Replies paused." : "Replies resumed."
  )
}

export async function updateNeedsHumanReplyAction(formData: FormData) {
  const { supabase, organization } = await getDashboardContext()

  const conversationId = String(formData.get("conversation_id") ?? "").trim()
  const needsHumanReply =
    String(formData.get("needs_human_reply") ?? "false") === "true"

  if (!conversationId) {
    redirectWithNotice("error", "Missing conversation.")
  }

  const isValidConversation = await validateConversation(
    conversationId,
    organization.id,
    supabase
  )

  if (!isValidConversation) {
    redirectWithNotice("error", "Conversation not found.")
  }

  const { error } = await supabase
    .from("conversations")
    .update({ needs_human_reply: needsHumanReply })
    .eq("id", conversationId)
    .eq("organization_id", organization.id)

  if (error) {
    redirectWithConversationNotice(
      conversationId,
      "error",
      "Unable to update human reply status."
    )
  }

  revalidatePath("/dashboard/inbox")
  redirectWithConversationNotice(
    conversationId,
    "success",
    needsHumanReply ? "Marked for human follow-up." : "Removed human follow-up flag."
  )
}
