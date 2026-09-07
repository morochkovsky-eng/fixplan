alter table public.assets
  add column if not exists manufacturer text,
  add column if not exists model text,
  add column if not exists serial_number text,
  add column if not exists installed_at text,
  add column if not exists purchase_cost numeric;

alter table public.assets
  drop constraint if exists assets_purchase_cost_nonnegative;

alter table public.assets
  add constraint assets_purchase_cost_nonnegative
  check (purchase_cost is null or purchase_cost >= 0);
