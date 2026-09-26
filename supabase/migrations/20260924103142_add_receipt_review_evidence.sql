alter table public.utility_bills
  add column if not exists extraction_evidence jsonb not null default '{}'::jsonb,
  add column if not exists review_fields jsonb not null default '[]'::jsonb,
  add column if not exists last_payment_minor bigint,
  add column if not exists last_payment_date date;

comment on column public.utility_bills.extraction_evidence is 'Field-level receipt values, raw evidence, source region ids and review status.';
comment on column public.utility_bills.review_fields is 'Canonical field paths that require owner review.';
comment on column public.utility_bills.last_payment_minor is 'Historical reference payment; excluded from current-period balance arithmetic.';
