import { redirect } from "next/navigation"

export default function ContactsPageRedirect() {
  redirect("/dashboard/inbox")
}
