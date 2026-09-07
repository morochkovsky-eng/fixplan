alter table public.inspection_results
  add column if not exists asset_code text,
  add column if not exists asset_name text,
  add column if not exists room_id text,
  add column if not exists category text;
