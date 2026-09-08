alter table public.apartments
  add column if not exists locale text not null default 'ru';

alter table public.apartments
  drop constraint if exists apartments_locale_check,
  add constraint apartments_locale_check check (locale in ('ru'));
