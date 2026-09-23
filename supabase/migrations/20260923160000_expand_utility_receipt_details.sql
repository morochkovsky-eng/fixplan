alter table public.utility_bills
  add column if not exists document_kind text,
  add column if not exists provider_name text,
  add column if not exists document_address text,
  add column if not exists account_number text,
  add column if not exists billing_period_month date,
  add column if not exists document_date date,
  add column if not exists due_date date,
  add column if not exists period_charge_minor bigint,
  add column if not exists opening_debt_minor bigint,
  add column if not exists opening_credit_minor bigint,
  add column if not exists paid_minor bigint,
  add column if not exists recalculation_minor bigint,
  add column if not exists benefit_minor bigint,
  add column if not exists penalty_minor bigint,
  add column if not exists mandatory_due_minor bigint,
  add column if not exists printed_due_minor bigint,
  add column if not exists arithmetic_difference_minor bigint,
  add column if not exists currency text not null default 'RUB',
  add column if not exists source_update_id bigint,
  add column if not exists source_fingerprint text,
  add column if not exists extraction_warnings jsonb not null default '[]'::jsonb;

create unique index if not exists utility_bills_source_update_unique
  on public.utility_bills(apartment_id, source_update_id)
  where source_update_id is not null;

create unique index if not exists utility_bills_source_fingerprint_unique
  on public.utility_bills(apartment_id, source_fingerprint)
  where source_fingerprint is not null;

create index if not exists utility_bills_monthly_summary_idx
  on public.utility_bills(apartment_id, billing_period_month, created_at);

create table if not exists public.utility_bill_line_items (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null,
  utility_bill_id text not null,
  position integer not null,
  name text not null,
  unit text,
  volume numeric,
  tariff numeric,
  charge_minor bigint,
  recalculation_minor bigint,
  benefit_minor bigint,
  total_minor bigint,
  created_at timestamptz not null default now(),
  foreign key (apartment_id, utility_bill_id)
    references public.utility_bills(apartment_id, id) on delete cascade,
  unique (apartment_id, utility_bill_id, position)
);

create table if not exists public.utility_bill_meter_entries (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null,
  utility_bill_id text not null,
  position integer not null,
  resource text not null,
  meter_number text,
  previous_value numeric,
  current_value numeric,
  consumption numeric,
  unit text,
  tariff numeric,
  created_at timestamptz not null default now(),
  foreign key (apartment_id, utility_bill_id)
    references public.utility_bills(apartment_id, id) on delete cascade,
  unique (apartment_id, utility_bill_id, position)
);

create table if not exists public.utility_bill_optional_charges (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null,
  utility_bill_id text not null,
  position integer not null,
  label text not null,
  kind text,
  amount_minor bigint not null,
  included_in_mandatory boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (apartment_id, utility_bill_id)
    references public.utility_bills(apartment_id, id) on delete cascade,
  unique (apartment_id, utility_bill_id, position)
);

create index if not exists utility_bill_line_items_bill_idx
  on public.utility_bill_line_items(apartment_id, utility_bill_id);
create index if not exists utility_bill_meter_entries_bill_idx
  on public.utility_bill_meter_entries(apartment_id, utility_bill_id);
create index if not exists utility_bill_optional_charges_bill_idx
  on public.utility_bill_optional_charges(apartment_id, utility_bill_id);

alter table public.utility_bill_line_items enable row level security;
alter table public.utility_bill_meter_entries enable row level security;
alter table public.utility_bill_optional_charges enable row level security;

create policy "members can manage utility bill line items"
on public.utility_bill_line_items for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create policy "members can manage utility bill meter entries"
on public.utility_bill_meter_entries for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create policy "members can manage utility bill optional charges"
on public.utility_bill_optional_charges for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

revoke all on public.utility_bill_line_items from anon;
revoke all on public.utility_bill_meter_entries from anon;
revoke all on public.utility_bill_optional_charges from anon;
