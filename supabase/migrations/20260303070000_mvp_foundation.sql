-- Mailee MVP foundation schema
-- This migration is intentionally provider-agnostic and ready for Supabase Postgres.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  -- Assumption: user_id maps to auth.users.id once Supabase Auth is connected.
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  tone text not null default 'friendly',
  system_prompt text,
  model text not null default 'gpt-4.1-mini',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  approval_mode text not null default 'hybrid' check (approval_mode in ('auto', 'review_required', 'hybrid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  provider text not null,
  from_name text,
  from_email text not null,
  reply_to_email text,
  domain text,
  domain_status text not null default 'pending' check (domain_status in ('pending', 'verified', 'failed')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, from_email)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inbox_id uuid references public.inboxes(id) on delete set null,
  external_id text,
  email text not null,
  full_name text,
  company text,
  lifecycle_stage text not null default 'trial' check (lifecycle_stage in ('trial', 'active', 'at_risk', 'churned')),
  timezone text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inbox_id uuid not null references public.inboxes(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  subject text not null,
  channel text not null default 'email',
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  started_at timestamptz not null default now(),
  last_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_message_id text,
  body_text text not null,
  body_html text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  event_name text not null,
  event_source text not null default 'app',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  key text not null,
  name text not null,
  description text,
  trigger_event text not null,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.playbook_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  category text not null check (category in ('activation', 'churn_risk', 'upsell', 'sentiment', 'feedback', 'other')),
  summary text not null,
  recommendation text,
  confidence numeric(4,3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  requested_by_agent_id uuid references public.agents(id) on delete set null,
  reviewer_user_id uuid,
  -- Assumption: reviewer_user_id maps to auth.users.id once auth is available.
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rationale text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_type text not null default 'system' check (actor_type in ('system', 'user', 'agent')),
  actor_user_id uuid,
  -- Assumption: actor_user_id maps to auth.users.id once auth is available.
  actor_agent_id uuid references public.agents(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_org_members_org on public.organization_members (organization_id);
create index if not exists idx_agents_org on public.agents (organization_id);
create index if not exists idx_inboxes_org on public.inboxes (organization_id);
create index if not exists idx_contacts_org on public.contacts (organization_id);
create index if not exists idx_contacts_stage on public.contacts (organization_id, lifecycle_stage);
create index if not exists idx_conversations_org on public.conversations (organization_id);
create index if not exists idx_conversations_status on public.conversations (organization_id, status);
create index if not exists idx_messages_conversation on public.messages (conversation_id, created_at desc);
create index if not exists idx_lifecycle_events_contact on public.lifecycle_events (contact_id, occurred_at desc);
create index if not exists idx_playbooks_org on public.playbooks (organization_id);
create index if not exists idx_playbook_runs_playbook on public.playbook_runs (playbook_id, created_at desc);
create index if not exists idx_insights_org on public.insights (organization_id, created_at desc);
create index if not exists idx_approvals_org on public.approvals (organization_id, status);
create index if not exists idx_audit_logs_org on public.audit_logs (organization_id, created_at desc);

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

create trigger agents_set_updated_at
before update on public.agents
for each row execute function public.set_updated_at();

create trigger inboxes_set_updated_at
before update on public.inboxes
for each row execute function public.set_updated_at();

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger playbooks_set_updated_at
before update on public.playbooks
for each row execute function public.set_updated_at();

create trigger playbook_runs_set_updated_at
before update on public.playbook_runs
for each row execute function public.set_updated_at();

create trigger insights_set_updated_at
before update on public.insights
for each row execute function public.set_updated_at();

create trigger approvals_set_updated_at
before update on public.approvals
for each row execute function public.set_updated_at();
