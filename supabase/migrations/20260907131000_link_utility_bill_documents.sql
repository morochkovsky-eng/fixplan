alter table public.asset_media
  add column if not exists utility_bill_id text;

alter table public.asset_media
  drop constraint if exists asset_media_apartment_id_utility_bill_id_fkey;

alter table public.asset_media
  add constraint asset_media_apartment_id_utility_bill_id_fkey
  foreign key (apartment_id, utility_bill_id)
  references public.utility_bills(apartment_id, id);

create unique index if not exists asset_media_utility_bill_id_unique
  on public.asset_media (apartment_id, utility_bill_id)
  where utility_bill_id is not null;
