alter table public.asset_media
  alter column asset_id drop not null,
  add column if not exists document_type text,
  add column if not exists document_issued_at date,
  add column if not exists document_valid_until date,
  add column if not exists document_note text;

alter table public.asset_media
  drop constraint if exists asset_media_document_type_check;

alter table public.asset_media
  add constraint asset_media_document_type_check check (
    document_type is null
    or document_type in (
      'passport',
      'manual',
      'warranty',
      'receipt',
      'invoice',
      'estimate',
      'act',
      'contract',
      'scheme',
      'other'
    )
  );
