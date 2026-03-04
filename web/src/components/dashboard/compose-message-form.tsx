"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type ComposeMessageFormProps = {
  conversationId: string
  defaultSubject: string
  repliesPaused: boolean
  repliesPausedReason: string | null
}

type SendResponse = {
  ok?: boolean
  error?: string
}

export function ComposeMessageForm({
  conversationId,
  defaultSubject,
  repliesPaused,
  repliesPausedReason,
}: ComposeMessageFormProps) {
  const router = useRouter()

  const [subject, setSubject] = useState("")
  const [bodyText, setBodyText] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (repliesPaused) {
      setStatus({
        type: "error",
        message:
          "Replies are paused for this conversation. Resume replies before sending.",
      })
      return
    }

    const normalizedBody = bodyText.trim()

    if (normalizedBody.length === 0) {
      setStatus({
        type: "error",
        message: "Write a message body before sending.",
      })
      return
    }

    setIsSending(true)
    setStatus(null)

    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          body_text: normalizedBody,
          subject: subject.trim() || undefined,
        }),
      })

      const payload = (await response.json().catch(() => null)) as SendResponse | null

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to send email right now.")
      }

      setBodyText("")
      setSubject("")
      setStatus({
        type: "success",
        message: "Email sent.",
      })
      router.refresh()
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to send email right now.",
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-background p-3">
      <div className="space-y-1.5">
        <label htmlFor="compose_subject" className="text-xs font-medium text-muted-foreground">
          Subject (optional override)
        </label>
        <Input
          id="compose_subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder={defaultSubject}
          maxLength={200}
          disabled={repliesPaused || isSending}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="compose_body" className="text-xs font-medium text-muted-foreground">
          Message
        </label>
        <Textarea
          id="compose_body"
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
          placeholder="Type your reply..."
          className="min-h-28"
          disabled={repliesPaused || isSending}
        />
      </div>

      {repliesPaused && (
        <p className="rounded-md border border-amber-400/70 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Replies are currently paused for this conversation.
          {repliesPausedReason ? ` Reason: ${repliesPausedReason}` : ""}
        </p>
      )}

      {status && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            status.type === "error"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-emerald-400/60 bg-emerald-50 text-emerald-700"
          }`}
        >
          {status.message}
        </p>
      )}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={repliesPaused || isSending}>
          {isSending ? "Sending..." : "Send"}
        </Button>
      </div>
    </form>
  )
}
