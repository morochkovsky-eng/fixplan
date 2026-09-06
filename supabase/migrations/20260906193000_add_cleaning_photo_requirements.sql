alter table public.cleanings
  add column if not exists require_photo_before boolean not null default false,
  add column if not exists require_photo_after boolean not null default false;
