-- Mailee v1 controls: conversation automation fields + org-level configuration tables
-- Includes expanded RLS coverage for v1 dashboard surfaces.

alter table public.conversations
  add column if not exists ai_mode text not null default 'draft',
  add column if not exists replies_paused boolean not null default false,
  add column if not exists replies_paused_reason text,
  add column if not exists goal_key text,
  add column if not exists ai_summary text,
  add column if not exists needs_human_reply boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_ai_mode_check'
  ) then
    alter table public.conversations
      add constraint conversations_ai_mode_check
      check (ai_mode in ('draft', 'auto'));
  end if;
end;
$$;

create table if not exists public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  website_url text,
  company_summary text,
  default_ai_mode text not null default 'draft' check (default_ai_mode in ('draft', 'auto')),
  reply_style text,
  escalation_keywords text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_faqs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  question text not null,
  answer text not null,
  tags text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  offer_type text not null default 'custom' check (offer_type in ('percent', 'fixed', 'trial_extension', 'custom')),
  value_text text,
  terms text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  event_type text not null default 'other' check (
    event_type in (
      'feedback',
      'feature_request',
      'discount_sent',
      'upsell_won',
      'user_recovered',
      'demo_booked',
      'trial_started',
      'needs_human',
      'other'
    )
  ),
  title text not null,
  details text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_org_needs_human_reply
  on public.conversations (organization_id, needs_human_reply);

create index if not exists idx_conversations_org_ai_mode
  on public.conversations (organization_id, ai_mode);

create index if not exists idx_organization_settings_org
  on public.organization_settings (organization_id);

create index if not exists idx_organization_faqs_org
  on public.organization_faqs (organization_id);

create index if not exists idx_organization_faqs_org_active
  on public.organization_faqs (organization_id, is_active);

create index if not exists idx_organization_offers_org
  on public.organization_offers (organization_id);

create index if not exists idx_organization_offers_org_active
  on public.organization_offers (organization_id, is_active);

create index if not exists idx_organization_goals_org
  on public.organization_goals (organization_id);

create index if not exists idx_organization_goals_org_active
  on public.organization_goals (organization_id, is_active);

create index if not exists idx_conversation_events_org_occurred
  on public.conversation_events (organization_id, occurred_at desc);

create index if not exists idx_conversation_events_org_type
  on public.conversation_events (organization_id, event_type);

create index if not exists idx_conversation_events_conversation
  on public.conversation_events (conversation_id, occurred_at desc);

create index if not exists idx_conversation_events_contact
  on public.conversation_events (contact_id, occurred_at desc);

drop trigger if exists organization_settings_set_updated_at on public.organization_settings;
create trigger organization_settings_set_updated_at
before update on public.organization_settings
for each row execute function public.set_updated_at();

drop trigger if exists organization_faqs_set_updated_at on public.organization_faqs;
create trigger organization_faqs_set_updated_at
before update on public.organization_faqs
for each row execute function public.set_updated_at();

drop trigger if exists organization_offers_set_updated_at on public.organization_offers;
create trigger organization_offers_set_updated_at
before update on public.organization_offers
for each row execute function public.set_updated_at();

drop trigger if exists organization_goals_set_updated_at on public.organization_goals;
create trigger organization_goals_set_updated_at
before update on public.organization_goals
for each row execute function public.set_updated_at();

alter table public.agents enable row level security;
alter table public.inboxes enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.organization_settings enable row level security;
alter table public.organization_faqs enable row level security;
alter table public.organization_offers enable row level security;
alter table public.organization_goals enable row level security;
alter table public.conversation_events enable row level security;

drop policy if exists agents_update on public.agents;
create policy agents_update
on public.agents
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists inboxes_update on public.inboxes;
create policy inboxes_update
on public.inboxes
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists contacts_update on public.contacts;
create policy contacts_update
on public.contacts
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists conversations_update on public.conversations;
create policy conversations_update
on public.conversations
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists messages_update on public.messages;
create policy messages_update
on public.messages
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select
on public.organization_settings
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists organization_settings_insert on public.organization_settings;
create policy organization_settings_insert
on public.organization_settings
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists organization_settings_update on public.organization_settings;
create policy organization_settings_update
on public.organization_settings
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists organization_faqs_select on public.organization_faqs;
create policy organization_faqs_select
on public.organization_faqs
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists organization_faqs_insert on public.organization_faqs;
create policy organization_faqs_insert
on public.organization_faqs
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists organization_faqs_update on public.organization_faqs;
create policy organization_faqs_update
on public.organization_faqs
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists organization_offers_select on public.organization_offers;
create policy organization_offers_select
on public.organization_offers
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists organization_offers_insert on public.organization_offers;
create policy organization_offers_insert
on public.organization_offers
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists organization_offers_update on public.organization_offers;
create policy organization_offers_update
on public.organization_offers
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists organization_goals_select on public.organization_goals;
create policy organization_goals_select
on public.organization_goals
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists organization_goals_insert on public.organization_goals;
create policy organization_goals_insert
on public.organization_goals
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists organization_goals_update on public.organization_goals;
create policy organization_goals_update
on public.organization_goals
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists conversation_events_select on public.conversation_events;
create policy conversation_events_select
on public.conversation_events
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists conversation_events_insert on public.conversation_events;
create policy conversation_events_insert
on public.conversation_events
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists conversation_events_update on public.conversation_events;
create policy conversation_events_update
on public.conversation_events
for update
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));
