alter table public.utility_readings
  add column if not exists photo_storage_path text;

alter table public.asset_media
  add column if not exists utility_reading_id text;

alter table public.asset_media
  drop constraint if exists asset_media_apartment_id_utility_reading_id_fkey;

alter table public.asset_media
  add constraint asset_media_apartment_id_utility_reading_id_fkey
  foreign key (apartment_id, utility_reading_id)
  references public.utility_readings(apartment_id, id);

create unique index if not exists asset_media_utility_reading_id_unique
  on public.asset_media (apartment_id, utility_reading_id)
  where utility_reading_id is not null;
