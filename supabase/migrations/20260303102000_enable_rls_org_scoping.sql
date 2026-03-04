-- Mailee MVP: initial org-scoped RLS policies for authenticated users

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.user_id = auth.uid()
  );
$$;

grant execute on function public.is_organization_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.agents enable row level security;
alter table public.inboxes enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select
on public.organizations
for select
to authenticated
using (
  public.is_organization_member(id)
  or slug = concat('user-', auth.uid()::text)
);

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert
on public.organizations
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists organizations_update on public.organizations;
create policy organizations_update
on public.organizations
for update
to authenticated
using (public.is_organization_member(id))
with check (public.is_organization_member(id));

drop policy if exists organization_members_select_self on public.organization_members;
create policy organization_members_select_self
on public.organization_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists organization_members_insert_self on public.organization_members;
create policy organization_members_insert_self
on public.organization_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists agents_select on public.agents;
create policy agents_select
on public.agents
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists agents_insert on public.agents;
create policy agents_insert
on public.agents
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists inboxes_select on public.inboxes;
create policy inboxes_select
on public.inboxes
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists inboxes_insert on public.inboxes;
create policy inboxes_insert
on public.inboxes
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists contacts_select on public.contacts;
create policy contacts_select
on public.contacts
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert
on public.contacts
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists conversations_select on public.conversations;
create policy conversations_select
on public.conversations
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert
on public.conversations
for insert
to authenticated
with check (public.is_organization_member(organization_id));

drop policy if exists messages_select on public.messages;
create policy messages_select
on public.messages
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert
on public.messages
for insert
to authenticated
with check (public.is_organization_member(organization_id));
