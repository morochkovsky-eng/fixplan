create table if not exists public.cleaning_templates (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.cleaning_type not null default 'standard',
  zones text[] not null default '{}',
  checklist text[] not null default '{}',
  supplies text[] not null default '{}',
  notes text,
  require_photo_before boolean not null default false,
  require_photo_after boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apartment_id, name),
  constraint cleaning_templates_name_not_blank check (length(trim(name)) > 0),
  constraint cleaning_templates_checklist_not_empty check (cardinality(checklist) > 0)
);

alter table public.cleaning_templates enable row level security;

drop policy if exists "members can manage cleaning templates" on public.cleaning_templates;
create policy "members can manage cleaning templates"
on public.cleaning_templates for all
using (public.is_apartment_member(apartment_id))
with check (public.is_apartment_member(apartment_id));
