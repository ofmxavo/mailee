export const ENV_KEYS = {
  NEXT_PUBLIC_SUPABASE_URL: "NEXT_PUBLIC_SUPABASE_URL",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  RESEND_API_KEY: "RESEND_API_KEY",
  RESEND_WEBHOOK_SECRET: "RESEND_WEBHOOK_SECRET",
  MAIL_FROM_FALLBACK: "MAIL_FROM_FALLBACK",
} as const

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS]

export const REQUIRED_APP_ENV_KEYS: EnvKey[] = [
  ENV_KEYS.NEXT_PUBLIC_SUPABASE_URL,
  ENV_KEYS.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ENV_KEYS.SUPABASE_SERVICE_ROLE_KEY,
  ENV_KEYS.OPENAI_API_KEY,
]

export const REQUIRED_SUPABASE_ENV_KEYS: EnvKey[] = [
  ENV_KEYS.NEXT_PUBLIC_SUPABASE_URL,
  ENV_KEYS.NEXT_PUBLIC_SUPABASE_ANON_KEY,
]

export class MissingEnvironmentError extends Error {
  missingKeys: string[]

  constructor(missingKeys: string[]) {
    super(
      `Missing required environment variables: ${missingKeys.join(", ")}. Add them to your .env.local file.`
    )
    this.name = "MissingEnvironmentError"
    this.missingKeys = missingKeys
  }
}

function readEnv(key: EnvKey): string | undefined {
  const value = process.env[key]

  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function getMissingEnvKeys(keys: EnvKey[] = REQUIRED_APP_ENV_KEYS): EnvKey[] {
  return keys.filter((key) => !readEnv(key))
}

export function hasRequiredEnv(keys: EnvKey[] = REQUIRED_APP_ENV_KEYS): boolean {
  return getMissingEnvKeys(keys).length === 0
}

export function assertEnv(keys: EnvKey[] = REQUIRED_APP_ENV_KEYS): void {
  const missing = getMissingEnvKeys(keys)

  if (missing.length > 0) {
    throw new MissingEnvironmentError(missing)
  }
}

export function getSupabasePublicEnv(): {
  url?: string
  anonKey?: string
  isConfigured: boolean
  missing: EnvKey[]
} {
  const url = readEnv(ENV_KEYS.NEXT_PUBLIC_SUPABASE_URL)
  const anonKey = readEnv(ENV_KEYS.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const missing = getMissingEnvKeys(REQUIRED_SUPABASE_ENV_KEYS)

  return {
    url,
    anonKey,
    isConfigured: missing.length === 0,
    missing,
  }
}

export function getServiceRoleKey(): string | undefined {
  return readEnv(ENV_KEYS.SUPABASE_SERVICE_ROLE_KEY)
}

export function getResendApiKey(): string | undefined {
  return readEnv(ENV_KEYS.RESEND_API_KEY)
}

export function getResendWebhookSecret(): string | undefined {
  return readEnv(ENV_KEYS.RESEND_WEBHOOK_SECRET)
}

export function getMailFromFallback(): string | undefined {
  return readEnv(ENV_KEYS.MAIL_FROM_FALLBACK)
}
