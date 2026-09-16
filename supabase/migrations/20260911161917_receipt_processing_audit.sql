alter table public.apartments add column if not exists receipt_exclude_penalties boolean;
alter table public.utility_bills add column if not exists receipt_calculation jsonb;

create table public.receipt_provider_rules (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  provider_key text not null,
  period_offset integer not null check (period_offset between -12 and 12),
  reason text not null,
  confirmed_at timestamptz not null default now(),
  primary key (apartment_id, provider_key)
);
alter table public.receipt_provider_rules enable row level security;
grant select on public.receipt_provider_rules to authenticated;
grant all on public.receipt_provider_rules to service_role;
create policy "Members read receipt rules" on public.receipt_provider_rules for select to authenticated
  using (public.is_apartment_member(apartment_id));

create table public.receipt_processing_audit (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  storage_path text not null,
  content_hash text not null,
  response_id text,
  model text,
  extraction jsonb not null,
  calculation jsonb not null,
  created_at timestamptz not null default now()
);
create index receipt_processing_source_idx on public.receipt_processing_audit(apartment_id, content_hash);
alter table public.receipt_processing_audit enable row level security;
grant select on public.receipt_processing_audit to authenticated;
grant all on public.receipt_processing_audit to service_role;
create policy "Members read receipt audit" on public.receipt_processing_audit for select to authenticated
  using (public.is_apartment_member(apartment_id));

create table public.telegram_processing_locks (
  telegram_user_id bigint primary key,
  token uuid not null,
  expires_at timestamptz not null
);
alter table public.telegram_processing_locks enable row level security;
grant all on public.telegram_processing_locks to service_role;
create function public.claim_telegram_processing(p_user_id bigint, p_token uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with claimed as (
    insert into public.telegram_processing_locks(telegram_user_id, token, expires_at)
    values(p_user_id, p_token, now() + interval '5 minutes')
    on conflict (telegram_user_id) do update
      set token = excluded.token, expires_at = excluded.expires_at
      where public.telegram_processing_locks.expires_at < now()
    returning 1
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_telegram_processing(bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_telegram_processing(bigint, uuid) to service_role;

-- Explicit owner approval in the receipt-processing request, 2026-09-11.
update public.apartments set receipt_exclude_penalties = true
where id = '00000000-0000-4000-8000-000000000034';
insert into public.receipt_provider_rules(apartment_id, provider_key, period_offset, reason)
select id, 'RU:INN:7841310500', -1,
  'Подтверждено владельцем 11.09.2026: сентябрьская квитанция ТСЖ Шпалерная 34 относится к августу для расчёта с жильцом.'
from public.apartments where id = '00000000-0000-4000-8000-000000000034';
