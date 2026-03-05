export const AUTOMATION_DAILY_SEND_LIMIT = 80

export function isAutomationActive(defaultAiMode: string | null | undefined): boolean {
  return String(defaultAiMode ?? "draft").trim().toLowerCase() === "auto"
}

export function buildIntroEmailText(params: {
  contactName?: string | null
  organizationName?: string | null
  websiteUrl?: string | null
}): string {
  const contactName = String(params.contactName ?? "").trim()
  const organizationName = String(params.organizationName ?? "").trim() || "our team"
  const websiteUrl = String(params.websiteUrl ?? "").trim()

  const greeting = contactName.length > 0 ? `Hi ${contactName},` : "Hi there,"
  const websiteLine =
    websiteUrl.length > 0 ? `You can check us out here: ${websiteUrl}\n\n` : ""

  return `${greeting}

Thanks for signing up with ${organizationName}. I wanted to quickly check in and see if you need help getting value from your account.

${websiteLine}If you'd like, reply with what you're trying to do and I can suggest the fastest next steps.

Best,
Mailee`
}

export function buildBasicAutoReplyText(params: {
  senderName?: string | null
  organizationName?: string | null
  replyStyle?: string | null
  companySummary?: string | null
}): string {
  const senderName = String(params.senderName ?? "").trim()
  const organizationName = String(params.organizationName ?? "").trim() || "our team"
  const replyStyle = String(params.replyStyle ?? "").trim()
  const companySummary = String(params.companySummary ?? "").trim()
  const greeting = senderName.length > 0 ? `Hi ${senderName},` : "Hi there,"

  const contextLine =
    companySummary.length > 0
      ? `Quick context: ${companySummary}`
      : `Thanks for reaching out to ${organizationName}.`

  const styleLine =
    replyStyle.length > 0
      ? `I will keep replies ${replyStyle.toLowerCase()}.`
      : "I will keep replies concise and practical."

  return `${greeting}

Thanks for your message.
${contextLine}
${styleLine}

If you share the outcome you want, I can help with the exact next step.`
}
