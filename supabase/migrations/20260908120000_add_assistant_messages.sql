create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  channel text not null check (channel in ('web', 'telegram')),
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_owner_apartment_created_idx
  on public.assistant_messages(owner_user_id, apartment_id, created_at desc);

alter table public.assistant_messages enable row level security;

drop policy if exists "owners can read their assistant messages" on public.assistant_messages;
create policy "owners can read their assistant messages"
on public.assistant_messages for select
using (
  owner_user_id = auth.uid()
  and public.is_apartment_manager(apartment_id)
);

drop policy if exists "owners can create their assistant messages" on public.assistant_messages;
create policy "owners can create their assistant messages"
on public.assistant_messages for insert
with check (
  owner_user_id = auth.uid()
  and public.is_apartment_manager(apartment_id)
);
