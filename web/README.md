# Mailee Web (MVP Backend-Wired)

This app is the Next.js frontend for **Mailee** — an AI customer concierge that runs proactive email conversations for activation and retention.

## Local setup

From the repository root:

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment setup

1. Copy the example file:

```bash
cp .env.example .env.local
```

2. Set these required keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (set to your live app domain, e.g. `https://mailee-one.vercel.app`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (optional for current dashboard/auth flow, used by future AI features)

If Supabase keys are missing, the app does **not** crash. UI shows setup warnings and data-backed flows are disabled.

## Auth flow

- Sign up page: `/sign-up` (email + password)
- Sign in page: `/sign-in` (email + password)
- Email confirmation callback: `/auth/confirm`
- Protected area: `/dashboard/**`
- Unauthenticated users are redirected to `/sign-in`
- Sidebar includes a server-side sign-out action

For Supabase Auth redirects, add your app URL(s) in Supabase Dashboard → Authentication → URL Configuration:
- Site URL: your primary app URL
- Redirect URLs: include `https://<your-domain>/auth/confirm` and any preview/test domains you use

## First-user bootstrap behavior

On the first authenticated dashboard load, the app performs idempotent org bootstrap:

1. Looks for an existing `organization_members` row for `auth.uid()`.
2. If none exists, creates (or reuses) a default organization with slug `user-<auth.uid()>`.
3. Ensures membership exists in `organization_members` with role `owner`.

This logic is safe to run repeatedly and on concurrent requests.

## Live data now wired

The following routes are Supabase-backed (no mock list data):

- `/dashboard/contacts`
  - Reads `contacts` scoped to current organization
  - Create contact form (email required, full name optional)
- `/dashboard/conversations`
  - Reads `conversations` scoped to current organization
  - Reads `messages` for the active conversation
  - Create conversation form (contact + subject, status defaults to `open`)

When creating the first conversation for an org, the app lazily ensures a default `agent` and `inbox` exist to satisfy foreign keys.

## Supabase migration steps

SQL migrations are stored at:

- `../supabase/migrations/`

Apply migrations after linking your project:

```bash
# from repo root
supabase link --project-ref <your-project-ref>
supabase db push
```

## RLS coverage added

Initial org-scoped RLS policies are included for:

- `organizations`
- `organization_members`
- `agents`
- `inboxes`
- `contacts`
- `conversations`
- `messages`

Policies enforce authenticated access scoped to rows belonging to organizations where the user is a member.

## Quality checks

```bash
npm run lint
npm run build
```
