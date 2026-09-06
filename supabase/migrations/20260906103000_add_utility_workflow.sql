do $$
begin
  create type public.utility_bill_status as enum ('draft', 'due', 'paid', 'overdue');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.utility_meter_status as enum ('due', 'submitted', 'overdue');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.utility_reading_source as enum ('owner', 'telegram', 'manual');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.utility_bills (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  service text not null,
  period text not null,
  amount numeric not null default 0,
  due_date_label text not null default '',
  paid_at_label text,
  status public.utility_bill_status not null default 'due',
  receipt_url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (apartment_id, id),
  constraint utility_bills_service_not_blank check (length(trim(service)) > 0),
  constraint utility_bills_period_not_blank check (length(trim(period)) > 0),
  constraint utility_bills_amount_non_negative check (amount >= 0)
);

create table if not exists public.utility_meters (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  service text not null,
  label text not null,
  serial text not null default '',
  location text not null default '',
  unit text not null default '',
  next_due_label text not null default '',
  status public.utility_meter_status not null default 'due',
  last_reading numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (apartment_id, id),
  constraint utility_meters_label_not_blank check (length(trim(label)) > 0)
);

create table if not exists public.utility_readings (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  meter_id text not null,
  period text not null,
  value numeric not null,
  submitted_at_label text not null default '',
  source public.utility_reading_source not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (apartment_id, id),
  foreign key (apartment_id, meter_id) references public.utility_meters(apartment_id, id) on delete cascade,
  constraint utility_readings_period_not_blank check (length(trim(period)) > 0)
);

alter table public.utility_bills enable row level security;
alter table public.utility_meters enable row level security;
alter table public.utility_readings enable row level security;

drop policy if exists "members can manage utility bills" on public.utility_bills;
create policy "members can manage utility bills"
on public.utility_bills for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

drop policy if exists "members can manage utility meters" on public.utility_meters;
create policy "members can manage utility meters"
on public.utility_meters for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

drop policy if exists "members can manage utility readings" on public.utility_readings;
create policy "members can manage utility readings"
on public.utility_readings for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

insert into public.utility_bills (apartment_id, id, service, period, amount, due_date_label, paid_at_label, status, receipt_url, note) values
('00000000-0000-4000-8000-000000000034'::uuid, 'bill-aug-electricity', 'Электричество', 'Август 2026', 4860, '10.09.2026', null, 'due'::public.utility_bill_status, null, 'Перед оплатой сверить показания счетчика.'),
('00000000-0000-4000-8000-000000000034'::uuid, 'bill-aug-water', 'Вода', 'Август 2026', 2380, '05.09.2026', '28.08.2026', 'paid'::public.utility_bill_status, null, 'Оплачено по квитанции УК.')
on conflict (apartment_id, id) do nothing;

insert into public.utility_meters (apartment_id, id, service, label, serial, location, unit, next_due_label, status, last_reading) values
('00000000-0000-4000-8000-000000000034'::uuid, 'meter-cold-water', 'cold_water', 'Холодная вода', '210152202', 'Прихожая', 'м3', '25.09.2026', 'overdue'::public.utility_meter_status, 128.4),
('00000000-0000-4000-8000-000000000034'::uuid, 'meter-hot-water', 'hot_water', 'Горячая вода', '0049391', 'Прихожая', 'м3', '25.09.2026', 'overdue'::public.utility_meter_status, 62.1),
('00000000-0000-4000-8000-000000000034'::uuid, 'meter-electricity', 'electricity', 'Электроэнергия', '60196178', 'Квартира', 'кВт·ч', '25.09.2026', 'due'::public.utility_meter_status, 4830)
on conflict (apartment_id, id) do nothing;

insert into public.utility_readings (apartment_id, id, meter_id, period, value, submitted_at_label, source, note) values
('00000000-0000-4000-8000-000000000034'::uuid, 'reading-aug-cold-water', 'meter-cold-water', 'Август 2026', 128.4, '24.08.2026', 'telegram'::public.utility_reading_source, 'Передано владельцем через будущий сценарий бота.'),
('00000000-0000-4000-8000-000000000034'::uuid, 'reading-aug-hot-water', 'meter-hot-water', 'Август 2026', 62.1, '24.08.2026', 'manual'::public.utility_reading_source, null),
('00000000-0000-4000-8000-000000000034'::uuid, 'reading-aug-electricity', 'meter-electricity', 'Август 2026', 4830, '24.08.2026', 'owner'::public.utility_reading_source, null)
on conflict (apartment_id, id) do nothing;
