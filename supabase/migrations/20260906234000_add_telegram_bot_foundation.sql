create table if not exists public.telegram_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  code_hash text not null unique,
  role text not null check (role in ('owner', 'cleaner', 'master')),
  created_by text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_accounts (
  telegram_user_id bigint primary key,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  chat_id bigint not null,
  role text not null check (role in ('owner', 'cleaner', 'master')),
  display_name text not null default '',
  username text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_conversations (
  telegram_user_id bigint primary key references public.telegram_accounts(telegram_user_id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  previous_response_id text,
  pending_action jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_updates (
  update_id bigint primary key,
  telegram_user_id bigint,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.telegram_pairing_codes enable row level security;
alter table public.telegram_accounts enable row level security;
alter table public.telegram_conversations enable row level security;
alter table public.telegram_updates enable row level security;

create or replace function public.is_apartment_manager(target_apartment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.apartment_members member
    where member.apartment_id = target_apartment_id
      and member.role in ('owner', 'admin')
      and (
        member.user_id = auth.uid()
        or lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

drop policy if exists "members can manage telegram pairing codes" on public.telegram_pairing_codes;
create policy "members can manage telegram pairing codes"
on public.telegram_pairing_codes for all
using (public.is_apartment_manager(apartment_id))
with check (public.is_apartment_manager(apartment_id));

drop policy if exists "members can manage telegram accounts" on public.telegram_accounts;
create policy "members can manage telegram accounts"
on public.telegram_accounts for all
using (public.is_apartment_manager(apartment_id))
with check (public.is_apartment_manager(apartment_id));

drop policy if exists "members can manage telegram conversations" on public.telegram_conversations;
create policy "members can manage telegram conversations"
on public.telegram_conversations for all
using (public.is_apartment_manager(apartment_id))
with check (public.is_apartment_manager(apartment_id));
