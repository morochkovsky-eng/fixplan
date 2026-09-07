alter table public.telegram_pairing_codes
  rename column apartment_id to default_apartment_id;

alter table public.telegram_accounts
  rename column apartment_id to default_apartment_id;

alter table public.telegram_conversations
  rename column apartment_id to active_apartment_id;

alter table public.telegram_pairing_codes
  add column owner_user_id uuid references auth.users(id) on delete cascade,
  add column owner_email text;

alter table public.telegram_accounts
  add column owner_user_id uuid references auth.users(id) on delete cascade,
  add column owner_email text;

with candidates as (
  select distinct on (pairing.id)
    pairing.id,
    member.user_id,
    member.email
  from public.telegram_pairing_codes pairing
  join public.apartment_members member
    on member.apartment_id = pairing.default_apartment_id
   and member.role in ('owner', 'admin')
   and lower(member.email) = lower(pairing.created_by)
  order by pairing.id, (member.role = 'owner') desc, member.created_at
)
update public.telegram_pairing_codes pairing
set owner_user_id = candidate.user_id,
    owner_email = candidate.email
from candidates candidate
where candidate.id = pairing.id;

with candidates as (
  select distinct on (account.telegram_user_id)
    account.telegram_user_id,
    member.user_id,
    member.email
  from public.telegram_accounts account
  join public.apartment_members member
    on member.apartment_id = account.default_apartment_id
   and member.role in ('owner', 'admin')
  order by account.telegram_user_id, (member.role = 'owner') desc, member.created_at
)
update public.telegram_accounts account
set owner_user_id = candidate.user_id,
    owner_email = candidate.email
from candidates candidate
where candidate.telegram_user_id = account.telegram_user_id;

delete from public.telegram_pairing_codes where owner_user_id is null;
delete from public.telegram_accounts where owner_user_id is null;

delete from public.telegram_accounts account
using (
  select telegram_user_id
  from (
    select
      telegram_user_id,
      row_number() over (partition by owner_user_id order by updated_at desc, created_at desc) as position
    from public.telegram_accounts
  ) ranked
  where ranked.position > 1
) duplicate
where duplicate.telegram_user_id = account.telegram_user_id;

alter table public.telegram_pairing_codes
  alter column owner_user_id set not null,
  alter column owner_email set not null;

alter table public.telegram_accounts
  alter column owner_user_id set not null,
  alter column owner_email set not null;

create unique index if not exists telegram_accounts_owner_user_id_key
  on public.telegram_accounts(owner_user_id);

drop policy if exists "members can manage telegram pairing codes" on public.telegram_pairing_codes;
create policy "owners can manage their telegram pairing codes"
on public.telegram_pairing_codes for all
using (
  owner_user_id = auth.uid()
  or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  owner_user_id = auth.uid()
  or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "members can manage telegram accounts" on public.telegram_accounts;
create policy "owners can manage their telegram account"
on public.telegram_accounts for all
using (
  owner_user_id = auth.uid()
  or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  owner_user_id = auth.uid()
  or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "members can manage telegram conversations" on public.telegram_conversations;
create policy "owners can manage their telegram conversation"
on public.telegram_conversations for all
using (
  exists (
    select 1
    from public.telegram_accounts account
    where account.telegram_user_id = telegram_conversations.telegram_user_id
      and (
        account.owner_user_id = auth.uid()
        or lower(account.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
)
with check (
  exists (
    select 1
    from public.telegram_accounts account
    where account.telegram_user_id = telegram_conversations.telegram_user_id
      and (
        account.owner_user_id = auth.uid()
        or lower(account.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);
