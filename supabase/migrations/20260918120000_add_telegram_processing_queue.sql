alter table public.telegram_updates
  drop constraint if exists telegram_updates_status_check;

update public.telegram_updates
set status = 'queued'
where status = 'processing';

alter table public.telegram_updates
  alter column status set default 'queued',
  add column if not exists chat_id bigint,
  add column if not exists request_kind text,
  add column if not exists payload jsonb,
  add column if not exists processing_message_id bigint,
  add column if not exists status_last_updated_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists lock_expires_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists delivery_state text not null default 'pending',
  add column if not exists response_message_id bigint,
  add column if not exists status_finalized_at timestamptz,
  add column if not exists cleanup_status text,
  add column if not exists cleanup_attempts integer not null default 0;

alter table public.telegram_updates
  add constraint telegram_updates_delivery_state_check
  check (delivery_state in ('pending', 'sending', 'delivered')),
  add constraint telegram_updates_status_check
  check (status in ('queued', 'running', 'processed', 'failed', 'needs_review'));

alter table public.telegram_updates
  add constraint telegram_updates_cleanup_status_check
  check (cleanup_status is null or cleanup_status in ('succeeded', 'failed'));

create index if not exists telegram_updates_queue_idx
  on public.telegram_updates(status, received_at, update_id)
  where status = 'queued';

create index if not exists telegram_updates_active_user_idx
  on public.telegram_updates(telegram_user_id, status, lock_expires_at)
  where status in ('queued', 'running');

create table if not exists public.telegram_request_traces (
  id bigint generated always as identity primary key,
  update_id bigint not null references public.telegram_updates(update_id) on delete cascade,
  event text not null,
  status text not null check (status in ('started', 'succeeded', 'failed', 'skipped')),
  duration_ms integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.telegram_request_traces enable row level security;
revoke all on public.telegram_request_traces from anon, authenticated;
grant all on public.telegram_request_traces to service_role;

create or replace function public.claim_next_telegram_update()
returns setof public.telegram_updates
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidate as (
    select queued.update_id
    from public.telegram_updates queued
    where queued.status = 'queued'
      and queued.payload is not null
      and queued.chat_id is not null
      and queued.delivery_state = 'pending'
      and queued.update_id = (
        select first_for_user.update_id
        from public.telegram_updates first_for_user
        where first_for_user.telegram_user_id = queued.telegram_user_id
          and first_for_user.status = 'queued'
        order by first_for_user.received_at, first_for_user.update_id
        limit 1
      )
      and not exists (
        select 1
        from public.telegram_updates active
        where active.telegram_user_id = queued.telegram_user_id
          and active.status = 'running'
          and active.lock_expires_at > now()
      )
    order by queued.received_at, queued.update_id
    for update of queued skip locked
    limit 1
  )
  update public.telegram_updates job
  set status = 'running',
      claimed_at = now(),
      lock_expires_at = now() + interval '5 minutes',
      attempts = job.attempts + 1
  from candidate
  where job.update_id = candidate.update_id
  returning job.*;
end;
$$;

revoke all on function public.claim_next_telegram_update() from public, anon, authenticated;
grant execute on function public.claim_next_telegram_update() to service_role;

create or replace function public.recover_stale_telegram_updates()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovered integer;
  requeued integer;
begin
  update public.telegram_updates
  set status = 'needs_review', claimed_at = null, lock_expires_at = null
  where status = 'running'
    and lock_expires_at <= now()
    and delivery_state = 'sending';
  get diagnostics recovered = row_count;

  update public.telegram_updates
  set status = 'queued', claimed_at = null, lock_expires_at = null
  where status = 'running'
    and lock_expires_at <= now()
    and delivery_state = 'pending'
    and response_message_id is null;
  get diagnostics requeued = row_count;
  recovered = recovered + requeued;
  return recovered;
end;
$$;

revoke all on function public.recover_stale_telegram_updates() from public, anon, authenticated;
grant execute on function public.recover_stale_telegram_updates() to service_role;
