delete from public.telegram_conversations
where telegram_user_id in (
  select telegram_user_id from public.telegram_accounts where role <> 'owner'
);

delete from public.telegram_accounts where role <> 'owner';
delete from public.telegram_pairing_codes where role <> 'owner';

alter table public.telegram_accounts drop column if exists role;
alter table public.telegram_pairing_codes drop column if exists role;
