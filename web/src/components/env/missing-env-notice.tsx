import { AlertTriangle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ENV_KEYS,
  getMissingEnvKeys,
  REQUIRED_APP_ENV_KEYS,
  REQUIRED_SUPABASE_ENV_KEYS,
} from "@/lib/env"

type MissingEnvNoticeProps = {
  scope?: "app" | "supabase"
}

const scopeLabels = {
  app: "App setup",
  supabase: "Supabase setup",
} as const

export function MissingEnvNotice({ scope = "app" }: MissingEnvNoticeProps) {
  const keysToCheck =
    scope === "supabase" ? REQUIRED_SUPABASE_ENV_KEYS : REQUIRED_APP_ENV_KEYS
  const missing = getMissingEnvKeys(keysToCheck)

  if (missing.length === 0) {
    return null
  }

  return (
    <Card className="border-amber-300 bg-amber-50/80">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2 text-amber-900">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <CardTitle className="text-sm font-semibold">
            {scopeLabels[scope]} is incomplete
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-amber-900">
        <p>
          Add the missing environment variables in <code>.env.local</code>. Until
          then, data-backed features stay disabled and UI falls back to static
          placeholders.
        </p>
        <div className="flex flex-wrap gap-2">
          {missing.map((key) => (
            <Badge key={key} variant="outline" className="border-amber-400">
              {key}
            </Badge>
          ))}
        </div>
        {missing.includes(ENV_KEYS.SUPABASE_SERVICE_ROLE_KEY) && (
          <p className="text-xs text-amber-800">
            Keep <code>{ENV_KEYS.SUPABASE_SERVICE_ROLE_KEY}</code> server-side only.
            Never expose it to browser code.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
