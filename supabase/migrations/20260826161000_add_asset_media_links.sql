alter table public.asset_media
  add column if not exists inspection_id text,
  add column if not exists media_type text not null default 'image/jpeg';

update public.asset_media
set inspection_id = split_part(storage_path, '/', 3)
where inspection_id is null
  and array_length(string_to_array(storage_path, '/'), 1) >= 4;

alter table public.asset_media
  drop constraint if exists asset_media_apartment_id_inspection_id_fkey;

alter table public.asset_media
  add constraint asset_media_apartment_id_inspection_id_fkey
  foreign key (apartment_id, inspection_id)
  references public.inspections(apartment_id, id)
  on delete set null;
