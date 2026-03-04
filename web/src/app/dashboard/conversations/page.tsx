import { redirect } from "next/navigation"

export default function ConversationsPageRedirect() {
  redirect("/dashboard/inbox")
}
