import { Sparkles } from "lucide-react"

import { DashboardNav } from "@/components/dashboard/dashboard-nav"
import { MissingEnvNotice } from "@/components/env/missing-env-notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getDashboardContext } from "@/lib/dashboard-context"

import { signOutAction } from "./actions"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { organization, user } = await getDashboardContext()

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 md:grid-cols-[220px_1fr] lg:px-8">
        <aside className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  Mailee
                </div>
                <p className="text-xs text-muted-foreground">
                  {user.email ?? "Signed-in user"}
                </p>
              </div>

              <DashboardNav />

              <div className="grid gap-2">
                <form action={signOutAction}>
                  <Button type="submit" variant="ghost" className="w-full">
                    Sign out
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
          <Badge variant="outline" className="w-fit">
            Workspace: {organization.name}
          </Badge>
        </aside>

        <main className="space-y-6">
          <MissingEnvNotice scope="supabase" />
          {children}
        </main>
      </div>
    </div>
  )
}
