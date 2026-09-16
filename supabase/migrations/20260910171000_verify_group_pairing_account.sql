-- Re-check the linked owner account when consuming a group invite.
create or replace function public.connect_telegram_apartment_group(p_hash text, p_user bigint, p_chat bigint, p_title text)
returns boolean language plpgsql security definer set search_path = public as $$
declare pairing public.telegram_group_pairings%rowtype;
begin
  select * into pairing from telegram_group_pairings where code_hash=p_hash and telegram_user_id=p_user and used_at is null and expires_at>now() for update;
  if not found then return false; end if;
  if not exists(select 1 from telegram_accounts where telegram_user_id=p_user and owner_user_id=pairing.owner_user_id and active=true) then return false; end if;
  if not exists(select 1 from apartment_members m join auth.users u on u.id=pairing.owner_user_id where m.apartment_id=pairing.apartment_id and m.role in ('owner','admin') and (m.user_id=u.id or lower(m.email)=lower(u.email))) then return false; end if;
  insert into telegram_apartment_groups(apartment_id,chat_id,title,connected_by)
  values(pairing.apartment_id,p_chat,p_title,pairing.owner_user_id)
  on conflict(apartment_id) do update set chat_id=excluded.chat_id,title=excluded.title,version=gen_random_uuid(),connected_by=excluded.connected_by,connected_at=now();
  update telegram_group_pairings set used_at=now() where code_hash=p_hash;
  update telegram_statement_deliveries set status='cancelled' where apartment_id=pairing.apartment_id and status='prepared';
  return true;
end $$;
revoke all on function public.connect_telegram_apartment_group(text,bigint,bigint,text) from public, anon, authenticated;
grant execute on function public.connect_telegram_apartment_group(text,bigint,bigint,text) to service_role;
