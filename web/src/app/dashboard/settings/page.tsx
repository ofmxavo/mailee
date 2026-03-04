import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getDashboardContext } from "@/lib/dashboard-context"

function resolveDisplayName(userName: unknown, fallbackEmail: string | null): string {
  if (typeof userName === "string" && userName.trim().length > 0) {
    return userName.trim()
  }

  if (fallbackEmail) {
    const prefix = fallbackEmail.split("@")[0]?.trim()

    if (prefix) {
      return prefix
    }
  }

  return "Not set"
}

export default async function SettingsPage() {
  const { user, organization } = await getDashboardContext()

  const displayName = resolveDisplayName(user.user_metadata?.full_name, user.email ?? null)

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Account profile, billing, and security placeholders for your workspace.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Read-only profile details from your current auth session.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="account_name" className="text-sm font-medium">
              Name
            </label>
            <Input id="account_name" value={displayName} readOnly />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="account_email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="account_email"
              value={user.email ?? "No email available"}
              readOnly
            />
          </div>
          <p className="md:col-span-2 text-xs text-muted-foreground">
            Workspace: {organization.name}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan and billing</CardTitle>
          <CardDescription>
            Billing controls are not wired yet. Stripe and invoices will be added in a
            future sprint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Current plan placeholder: Starter</p>
          <p>Billing management placeholder: payment method and invoice history.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password and security</CardTitle>
          <CardDescription>
            Password updates and advanced security controls are pending integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Password management placeholder: change password flow.</p>
          <p>Security placeholder: session management and 2FA.</p>
        </CardContent>
      </Card>
    </div>
  )
}
