create table if not exists public.notification_events (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  recipient text not null,
  entity_type text not null,
  entity_id text not null,
  title text not null,
  body text not null default '',
  action_url text,
  payload jsonb not null default '{}'::jsonb,
  channels text[] not null default '{in_app,telegram}',
  dedupe_key text not null,
  read_at timestamptz,
  telegram_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (apartment_id, dedupe_key),
  constraint notification_events_recipient check (recipient in ('owner', 'cleaner'))
);

alter table public.notification_events enable row level security;

drop policy if exists "members can manage notification events" on public.notification_events;
create policy "members can manage notification events"
on public.notification_events for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create index if not exists notification_events_pending_telegram
  on public.notification_events (created_at)
  where telegram_delivered_at is null;
