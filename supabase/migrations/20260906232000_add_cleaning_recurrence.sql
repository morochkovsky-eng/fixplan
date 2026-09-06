do $$ begin
  create type public.cleaning_recurrence as enum ('none', 'weekly', 'biweekly', 'monthly');
exception
  when duplicate_object then null;
end $$;

alter table public.cleanings
  add column if not exists scheduled_for_at timestamptz,
  add column if not exists recurrence public.cleaning_recurrence not null default 'none',
  add column if not exists recurs_from_id text;

create unique index if not exists cleanings_recurs_from_once
  on public.cleanings (apartment_id, recurs_from_id)
  where recurs_from_id is not null;
