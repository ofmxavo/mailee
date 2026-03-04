-- Add message threading metadata fields for email reply linkage and webhook matching

alter table public.messages
  add column if not exists message_id_header text,
  add column if not exists in_reply_to text,
  add column if not exists "references" text[] not null default '{}'::text[];

create index if not exists idx_messages_provider_message_id
  on public.messages (provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_messages_message_id_header
  on public.messages (message_id_header)
  where message_id_header is not null;
