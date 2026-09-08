alter table public.apartments
  add column if not exists utility_insurance_included boolean;
