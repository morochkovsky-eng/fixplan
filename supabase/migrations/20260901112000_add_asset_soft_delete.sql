alter table public.assets
add column if not exists deleted_at timestamptz;

create index if not exists assets_active_idx
on public.assets (apartment_id, code)
where deleted_at is null;

