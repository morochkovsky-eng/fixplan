alter type public.cleaning_status add value if not exists 'revision_requested' after 'completed';

alter table public.cleanings
  add column if not exists owner_feedback text;
