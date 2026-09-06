do $$ begin
  create type public.cleaning_photo_phase as enum ('before', 'after');
exception when duplicate_object then null; end $$;

create table if not exists public.cleaning_media (
  apartment_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  cleaning_id text not null,
  phase public.cleaning_photo_phase not null,
  storage_path text not null,
  media_type text not null default 'image/jpeg',
  filename text not null default 'Фото уборки',
  created_at timestamptz not null default now(),
  foreign key (apartment_id, cleaning_id)
    references public.cleanings(apartment_id, id) on delete cascade
);

alter table public.cleaning_media enable row level security;
drop policy if exists "members can manage cleaning media" on public.cleaning_media;
create policy "members can manage cleaning media" on public.cleaning_media for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));
