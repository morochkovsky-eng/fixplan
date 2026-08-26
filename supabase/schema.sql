create extension if not exists pgcrypto;

create type public.asset_status as enum ('ok', 'attention', 'in_progress', 'needs_master');
create type public.asset_category as enum ('electric', 'plumbing', 'appliance', 'furniture', 'window', 'hvac');
create type public.asset_kind as enum (
  'socket',
  'switch',
  'light',
  'plumbing_fixture',
  'drain',
  'appliance',
  'furniture',
  'window',
  'radiator',
  'warm_floor',
  'ventilation',
  'hvac'
);
create type public.event_type as enum ('inspection', 'comment', 'repair', 'status', 'photo', 'master', 'report');
create type public.inspection_status as enum ('draft', 'sent', 'in_progress', 'completed', 'accepted');
create type public.contractor_scope as enum ('plumbing', 'electric', 'all', 'custom');
create type public.inspection_workflow as enum ('inspection', 'work_order');

create table public.apartments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.apartment_members (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (apartment_id, email)
);

create table public.rooms (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  name text not null,
  sort_order integer not null default 0,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  primary key (apartment_id, id)
);

create table public.assets (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  code text not null,
  name text not null,
  room_id text not null,
  category public.asset_category not null,
  kind public.asset_kind,
  status public.asset_status not null default 'ok',
  x numeric not null,
  y numeric not null,
  last_checked text not null default 'не проверялось',
  warranty_until text,
  master text,
  photo_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (apartment_id, id),
  foreign key (apartment_id, room_id) references public.rooms(apartment_id, id)
);

create table public.inspections (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  number text not null,
  title text not null,
  created_at_label text not null,
  completed_at_label text,
  created_by text not null,
  contractor text not null,
  contractor_phone text,
  workflow public.inspection_workflow not null default 'inspection',
  scope public.contractor_scope not null,
  status public.inspection_status not null default 'draft',
  allowed_asset_ids text[] not null default '{}',
  asset_instructions jsonb not null default '{}'::jsonb,
  summary text not null default '',
  conclusion text,
  guest_token text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at timestamptz,
  result_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (apartment_id, id)
);

create table public.events (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  asset_id text not null,
  inspection_id text,
  type public.event_type not null,
  date_label text not null,
  title text not null,
  body text not null,
  cost numeric,
  master text,
  status_after public.asset_status,
  photo jsonb,
  created_at timestamptz not null default now(),
  primary key (apartment_id, id),
  foreign key (apartment_id, asset_id) references public.assets(apartment_id, id),
  foreign key (apartment_id, inspection_id) references public.inspections(apartment_id, id)
);

create table public.inspection_results (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  inspection_id text not null,
  asset_id text not null,
  status_after public.asset_status not null,
  comment text not null,
  date_label text not null,
  author text not null,
  cost numeric,
  photo_count integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (apartment_id, id),
  foreign key (apartment_id, inspection_id) references public.inspections(apartment_id, id) on delete cascade,
  foreign key (apartment_id, asset_id) references public.assets(apartment_id, id)
);

create table public.asset_media (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  asset_id text not null,
  event_id text,
  inspection_id text,
  storage_path text not null,
  media_type text not null default 'image/jpeg',
  caption text,
  created_by text,
  created_at timestamptz not null default now(),
  foreign key (apartment_id, asset_id) references public.assets(apartment_id, id),
  foreign key (apartment_id, inspection_id) references public.inspections(apartment_id, id) on delete set null,
  foreign key (apartment_id, event_id) references public.events(apartment_id, id)
);

insert into storage.buckets (id, name, public)
values ('asset-media', 'asset-media', false)
on conflict (id) do nothing;

create or replace function public.is_apartment_member(target_apartment_id uuid)
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
      and (
        member.user_id = auth.uid()
        or lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

alter table public.apartments enable row level security;
alter table public.apartment_members enable row level security;
alter table public.rooms enable row level security;
alter table public.assets enable row level security;
alter table public.events enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_results enable row level security;
alter table public.asset_media enable row level security;

create policy "members can read apartments"
on public.apartments for select
using (public.is_apartment_member(id));

create policy "members can manage apartments"
on public.apartments for all
using (public.is_apartment_member(id))
with check (public.is_apartment_member(id));

create policy "members can read membership"
on public.apartment_members for select
using (public.is_apartment_member(apartment_id));

create policy "owners can manage membership"
on public.apartment_members for all
using (
  exists (
    select 1 from public.apartment_members owner
    where owner.apartment_id = apartment_members.apartment_id
      and owner.role = 'owner'
      and (owner.user_id = auth.uid() or lower(owner.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
)
with check (
  exists (
    select 1 from public.apartment_members owner
    where owner.apartment_id = apartment_members.apartment_id
      and owner.role = 'owner'
      and (owner.user_id = auth.uid() or lower(owner.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
);

create policy "members can manage rooms"
on public.rooms for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create policy "members can manage assets"
on public.assets for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create policy "members can manage events"
on public.events for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create policy "members can manage inspections"
on public.inspections for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create policy "members can manage inspection results"
on public.inspection_results for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create policy "members can manage media rows"
on public.asset_media for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));

create policy "members can read media files"
on storage.objects for select
using (
  bucket_id = 'asset-media'
  and public.is_apartment_member((storage.foldername(name))[1]::uuid)
);

create policy "members can upload media files"
on storage.objects for insert
with check (
  bucket_id = 'asset-media'
  and public.is_apartment_member((storage.foldername(name))[1]::uuid)
);

create or replace function public.get_guest_inspection(access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inspection_row public.inspections%rowtype;
begin
  select * into inspection_row
  from public.inspections
  where guest_token = access_token
    and (expires_at is null or expires_at > now())
  limit 1;

  if inspection_row.id is null then
    raise exception 'Guest inspection not found or expired';
  end if;

  return jsonb_build_object(
    'inspection', to_jsonb(inspection_row) - 'guest_token',
    'assets', (
      select coalesce(jsonb_agg(to_jsonb(asset)), '[]'::jsonb)
      from public.assets asset
      where asset.apartment_id = inspection_row.apartment_id
        and asset.id = any(inspection_row.allowed_asset_ids)
    )
  );
end;
$$;

create or replace function public.submit_guest_report(
  access_token text,
  conclusion_text text,
  result_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inspection_row public.inspections%rowtype;
  item jsonb;
  result_id text;
begin
  select * into inspection_row
  from public.inspections
  where guest_token = access_token
    and (expires_at is null or expires_at > now())
  limit 1;

  if inspection_row.id is null then
    raise exception 'Guest inspection not found or expired';
  end if;

  for item in select * from jsonb_array_elements(result_payload)
  loop
    result_id := coalesce(item ->> 'id', 'res-' || encode(extensions.gen_random_bytes(8), 'hex'));

    insert into public.inspection_results (
      apartment_id,
      id,
      inspection_id,
      asset_id,
      status_after,
      comment,
      date_label,
      author,
      cost,
      photo_count
    )
    values (
      inspection_row.apartment_id,
      result_id,
      inspection_row.id,
      item ->> 'assetId',
      (item ->> 'statusAfter')::public.asset_status,
      coalesce(item ->> 'comment', ''),
      coalesce(item ->> 'date', to_char(now(), 'DD.MM.YYYY')),
      inspection_row.contractor,
      nullif(item ->> 'cost', '')::numeric,
      coalesce((item ->> 'photoCount')::integer, 0)
    )
    on conflict (apartment_id, id) do update set
      status_after = excluded.status_after,
      comment = excluded.comment,
      cost = excluded.cost,
      photo_count = excluded.photo_count;

    update public.assets
    set status = (item ->> 'statusAfter')::public.asset_status,
        master = inspection_row.contractor,
        updated_at = now()
    where apartment_id = inspection_row.apartment_id
      and id = item ->> 'assetId';
  end loop;

  update public.inspections
  set status = 'completed',
      conclusion = conclusion_text,
      completed_at_label = to_char(now(), 'DD.MM.YYYY'),
      summary = 'Мастер отправил отчет по выбранным узлам.',
      updated_at = now()
  where apartment_id = inspection_row.apartment_id
    and id = inspection_row.id;

  return jsonb_build_object('ok', true, 'inspectionId', inspection_row.id);
end;
$$;
