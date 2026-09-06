do $$ begin
  create type public.cleaning_type as enum ('standard', 'deep', 'post_renovation', 'turnover');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cleaning_mode as enum ('managed', 'record_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cleaning_status as enum ('draft', 'scheduled', 'in_progress', 'completed', 'accepted');
exception when duplicate_object then null; end $$;

create table if not exists public.cleanings (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  title text not null,
  type public.cleaning_type not null default 'standard',
  mode public.cleaning_mode not null default 'managed',
  zones text[] not null default '{}',
  checklist text[] not null default '{}',
  completed_items text[] not null default '{}',
  supplies text[] not null default '{}',
  scheduled_for_label text not null default '',
  cleaner text not null default '',
  cleaner_phone text,
  status public.cleaning_status not null default 'scheduled',
  cost numeric,
  notes text,
  guest_token text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_by text not null,
  created_at_label text not null,
  completed_at_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (apartment_id, id),
  constraint cleanings_title_not_blank check (length(trim(title)) > 0),
  constraint cleanings_cost_non_negative check (cost is null or cost >= 0)
);

alter table public.cleanings enable row level security;
drop policy if exists "members can manage cleanings" on public.cleanings;
create policy "members can manage cleanings" on public.cleanings for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));
