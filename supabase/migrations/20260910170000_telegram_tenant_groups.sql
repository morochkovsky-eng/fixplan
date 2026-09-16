-- Private server-managed group bindings and reviewed statement deliveries.
create table public.telegram_apartment_groups (
  apartment_id uuid primary key references public.apartments(id) on delete cascade,
  chat_id bigint not null unique,
  title text not null,
  version uuid not null default gen_random_uuid(),
  connected_by uuid not null references auth.users(id),
  connected_at timestamptz not null default now()
);
create table public.telegram_group_pairings (
  code_hash text primary key,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  telegram_user_id bigint not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
create table public.telegram_statement_deliveries (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  telegram_user_id bigint not null,
  group_version uuid,
  chat_id bigint,
  group_title text,
  period text not null,
  body text not null,
  fingerprint text not null,
  status text not null default 'prepared' check(status in ('prepared','sending','sent','cancelled','unknown','failed')),
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  sent_at timestamptz
);
create unique index telegram_statement_once on public.telegram_statement_deliveries(group_version,fingerprint)
where status in ('sending','sent','unknown');
alter table public.telegram_apartment_groups enable row level security;
alter table public.telegram_group_pairings enable row level security;
alter table public.telegram_statement_deliveries enable row level security;
revoke all on public.telegram_apartment_groups, public.telegram_group_pairings, public.telegram_statement_deliveries from anon, authenticated;
grant all on public.telegram_apartment_groups, public.telegram_group_pairings, public.telegram_statement_deliveries to service_role;

create function public.connect_telegram_apartment_group(p_hash text, p_user bigint, p_chat bigint, p_title text)
returns boolean language plpgsql security definer set search_path = public as $$
declare pairing public.telegram_group_pairings%rowtype;
begin
  select * into pairing from telegram_group_pairings where code_hash=p_hash and telegram_user_id=p_user and used_at is null and expires_at>now() for update;
  if not found then return false; end if;
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
