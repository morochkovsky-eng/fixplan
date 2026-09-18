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
  check (status in ('queued', 'running', 'processed', 'failed', 'delivery_unknown'));

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
  set status = 'delivery_unknown', claimed_at = null, lock_expires_at = null
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

create or replace function public.resolve_telegram_delivery_unknown(
  p_update_id bigint,
  p_resolution text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved integer;
begin
  if p_resolution = 'retry' then
    update public.telegram_updates
    set status = 'queued',
        delivery_state = 'pending',
        claimed_at = null,
        lock_expires_at = null,
        status_finalized_at = null,
        response_message_id = null,
        error = null
    where update_id = p_update_id
      and status = 'delivery_unknown';
  elsif p_resolution = 'mark_delivered' then
    update public.telegram_updates
    set status = 'processed',
        delivery_state = 'delivered',
        claimed_at = null,
        lock_expires_at = null,
        processed_at = coalesce(processed_at, now())
    where update_id = p_update_id
      and status = 'delivery_unknown';
  elsif p_resolution = 'fail' then
    update public.telegram_updates
    set status = 'failed',
        claimed_at = null,
        lock_expires_at = null,
        processed_at = coalesce(processed_at, now())
    where update_id = p_update_id
      and status = 'delivery_unknown';
  else
    raise exception 'Unsupported delivery resolution';
  end if;

  get diagnostics resolved = row_count;
  if resolved = 1 then
    insert into public.telegram_request_traces(update_id, event, status, details)
    values (
      p_update_id,
      'delivery.recovery',
      'succeeded',
      jsonb_build_object('resolution', p_resolution)
    );
  end if;
  return resolved = 1;
end;
$$;

revoke all on function public.resolve_telegram_delivery_unknown(bigint, text) from public, anon, authenticated;
grant execute on function public.resolve_telegram_delivery_unknown(bigint, text) to service_role;
