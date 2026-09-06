alter table public.cleanings
  add column if not exists zone_results jsonb not null default '[]'::jsonb;
