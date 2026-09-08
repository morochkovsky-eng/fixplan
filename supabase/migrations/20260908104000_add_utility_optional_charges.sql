alter table public.utility_bills
  add column if not exists optional_charge_label text,
  add column if not exists optional_charge_amount numeric not null default 0,
  add column if not exists optional_charge_included boolean not null default false;
