alter table public.apartments
  add column if not exists usage_mode text not null default 'living',
  add column if not exists currency text not null default 'RUB',
  add column if not exists timezone text not null default 'Europe/Moscow';

alter table public.apartments
  drop constraint if exists apartments_usage_mode_check,
  drop constraint if exists apartments_currency_check;

alter table public.apartments
  add constraint apartments_usage_mode_check check (usage_mode in ('living', 'rented')),
  add constraint apartments_currency_check check (currency in ('RUB', 'EUR', 'USD'));
