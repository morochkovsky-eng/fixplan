alter table public.apartments
  add column if not exists plan_storage_path text,
  add column if not exists plan_media_type text,
  add column if not exists plan_original_name text,
  add column if not exists plan_updated_at timestamptz;

alter table public.apartments
  drop constraint if exists apartments_plan_media_type_check;

alter table public.apartments
  add constraint apartments_plan_media_type_check
  check (
    plan_media_type is null
    or plan_media_type in (
      'application/pdf',
      'image/gif',
      'image/heic',
      'image/heif',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  );
