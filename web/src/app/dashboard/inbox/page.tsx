import Link from "next/link"

import { AutoInboxRefresh } from "@/components/dashboard/auto-inbox-refresh"
import { ComposeMessageForm } from "@/components/dashboard/compose-message-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getDashboardContext } from "@/lib/dashboard-context"

import {
  createConversationAction,
  updateConversationAiModeAction,
  updateConversationPauseAction,
  updateNeedsHumanReplyAction,
} from "./actions"

const statusVariantMap = {
  open: "default",
  pending: "secondary",
  closed: "outline",
} as const

type InboxPageProps = {
  searchParams: Promise<{
    success?: string
    error?: string
    conversation?: string
  }>
}

type ContactOption = {
  id: string
  email: string
  full_name: string | null
}

type ConversationRow = {
  id: string
  subject: string
  status: keyof typeof statusVariantMap
  contact_id: string
  last_message_at: string | null
  created_at: string
  ai_mode: "draft" | "auto"
  replies_paused: boolean
  replies_paused_reason: string | null
  needs_human_reply: boolean
  contacts: {
    full_name: string | null
    email: string
  } | null
}

type ConversationRawRow = Omit<ConversationRow, "contacts"> & {
  contacts:
    | {
        full_name: string | null
        email: string
      }[]
    | null
}

type MessageRow = {
  id: string
  direction: "inbound" | "outbound"
  body_text: string
  created_at: string
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const { success, error, conversation: selectedConversationId } = await searchParams
  const { supabase, organization } = await getDashboardContext()

  const [
    { data: contactsData, error: contactsError },
    { data: conversationsData, error: conversationsError },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, email, full_name")
      .eq("organization_id", organization.id)
      .order("full_name", { ascending: true }),
    supabase
      .from("conversations")
      .select(
        "id, subject, status, contact_id, last_message_at, created_at, ai_mode, replies_paused, replies_paused_reason, needs_human_reply, contacts(full_name, email)"
      )
      .eq("organization_id", organization.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ])

  const contacts = (contactsData ?? []) as ContactOption[]

  const rawConversations = (conversationsData ?? []) as unknown as ConversationRawRow[]
  const conversations: ConversationRow[] = rawConversations.map((conversation) => ({
    ...conversation,
    contacts: Array.isArray(conversation.contacts)
      ? (conversation.contacts[0] ?? null)
      : null,
  }))

  const activeConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? conversations[0]

  let messages: MessageRow[] = []

  if (activeConversation) {
    const { data: messagesData } = await supabase
      .from("messages")
      .select("id, direction, body_text, created_at")
      .eq("organization_id", organization.id)
      .eq("conversation_id", activeConversation.id)
      .order("created_at", { ascending: false })
      .limit(20)

    messages = ((messagesData ?? []) as MessageRow[]).reverse()
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Manage customer threads and adjust reply automation controls per
          conversation.
        </p>
      </header>

      {(success || error) && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-emerald-400/60 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? success}
        </p>
      )}

      <AutoInboxRefresh enabled={Boolean(activeConversation)} intervalSeconds={15} />

      <Card>
        <CardHeader>
          <CardTitle>New conversation</CardTitle>
          <CardDescription>
            Start an email thread from an existing contact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={createConversationAction}
            className="grid gap-3 md:grid-cols-[220px_1fr_auto]"
          >
            <select
              name="contact_id"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Select contact
              </option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.full_name ?? contact.email}
                </option>
              ))}
            </select>
            <Input
              name="subject"
              placeholder="Conversation subject"
              minLength={3}
              maxLength={200}
              required
            />
            <input type="hidden" name="status" value="open" />
            <Button type="submit" disabled={contacts.length === 0}>
              Create conversation
            </Button>
          </form>

          {contactsError && (
            <p className="mt-3 text-sm text-destructive">
              Unable to load contacts for conversation creation.
            </p>
          )}

          {!contactsError && contacts.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Add at least one contact before creating a conversation.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Threads</CardTitle>
            <CardDescription>
              Sorted by latest message and urgency.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {conversationsError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Unable to load conversations right now.
              </p>
            )}

            {!conversationsError && conversations.length === 0 && (
              <p className="rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
                No conversations yet. Create one above.
              </p>
            )}

            {conversations.map((conversation) => {
              const isActive = activeConversation?.id === conversation.id

              return (
                <Link
                  key={conversation.id}
                  href={`/dashboard/inbox?conversation=${conversation.id}`}
                  className={`block space-y-2 rounded-lg border bg-background p-3 transition-colors ${
                    isActive ? "border-primary/70 bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {conversation.contacts?.full_name ??
                        conversation.contacts?.email ??
                        "Unknown contact"}
                    </p>
                    <Badge variant={statusVariantMap[conversation.status]}>
                      {conversation.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{conversation.subject}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{conversation.ai_mode}</Badge>
                    {conversation.replies_paused && (
                      <Badge variant="outline">paused</Badge>
                    )}
                    {conversation.needs_human_reply && (
                      <Badge variant="secondary">needs human</Badge>
                    )}
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {activeConversation?.subject ?? "Select or create a conversation"}
              </CardTitle>
              <CardDescription>
                {activeConversation?.contacts?.full_name ??
                  activeConversation?.contacts?.email ??
                  "No active thread"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeConversation && (
                <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-3">
                  <form action={updateConversationAiModeAction} className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      AI mode
                    </label>
                    <input
                      type="hidden"
                      name="conversation_id"
                      value={activeConversation.id}
                    />
                    <select
                      name="ai_mode"
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      defaultValue={activeConversation.ai_mode}
                    >
                      <option value="draft">draft</option>
                      <option value="auto">auto</option>
                    </select>
                    <Button type="submit" size="sm" className="w-full">
                      Save
                    </Button>
                  </form>

                  <form action={updateConversationPauseAction} className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Replies
                    </label>
                    <input
                      type="hidden"
                      name="conversation_id"
                      value={activeConversation.id}
                    />
                    <input
                      type="hidden"
                      name="replies_paused"
                      value={activeConversation.replies_paused ? "false" : "true"}
                    />
                    <Textarea
                      name="replies_paused_reason"
                      placeholder="Optional pause reason"
                      defaultValue={activeConversation.replies_paused_reason ?? ""}
                      className="min-h-20"
                    />
                    <Button type="submit" size="sm" variant="outline" className="w-full">
                      {activeConversation.replies_paused ? "Resume replies" : "Pause replies"}
                    </Button>
                  </form>

                  <form action={updateNeedsHumanReplyAction} className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Human follow-up
                    </label>
                    <input
                      type="hidden"
                      name="conversation_id"
                      value={activeConversation.id}
                    />
                    <input
                      type="hidden"
                      name="needs_human_reply"
                      value={activeConversation.needs_human_reply ? "false" : "true"}
                    />
                    <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      {activeConversation.needs_human_reply
                        ? "This conversation is currently flagged for human reply."
                        : "No human handoff flag is active."}
                    </p>
                    <Button type="submit" size="sm" variant="outline" className="w-full">
                      {activeConversation.needs_human_reply
                        ? "Clear flag"
                        : "Mark needs human"}
                    </Button>
                  </form>
                </div>
              )}

              {activeConversation && (
                <ComposeMessageForm
                  conversationId={activeConversation.id}
                  defaultSubject={activeConversation.subject}
                  repliesPaused={activeConversation.replies_paused}
                  repliesPausedReason={activeConversation.replies_paused_reason}
                />
              )}

              {activeConversation && messages.length === 0 && (
                <p className="rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
                  No messages in this conversation yet.
                </p>
              )}

              {!activeConversation && (
                <p className="rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
                  Conversation details appear here once a thread exists.
                </p>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-lg border bg-background p-3 text-sm"
                >
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {message.direction}
                  </p>
                  <p>{message.body_text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
