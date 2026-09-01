create table if not exists public.asset_categories (
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  id text not null,
  label text not null,
  color text not null default '#0070f3',
  prefix text not null default '',
  plan_mode_id text not null default 'sockets',
  sort_order integer not null default 0,
  builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (apartment_id, id),
  constraint asset_categories_id_format check (id ~ '^[A-Za-z0-9_-]+$'),
  constraint asset_categories_label_not_blank check (length(trim(label)) > 0)
);

alter table public.assets
  alter column category type text using category::text;

alter table public.assets
  drop constraint if exists assets_category_not_blank;

alter table public.assets
  add constraint assets_category_not_blank check (length(trim(category)) > 0);

insert into public.asset_categories
  (apartment_id, id, label, color, prefix, plan_mode_id, sort_order, builtin)
values
  ('00000000-0000-4000-8000-000000000034'::uuid, 'electric', 'Электрика', '#0070f3', 'R-', 'sockets', 10, true),
  ('00000000-0000-4000-8000-000000000034'::uuid, 'plumbing', 'Сантехника', '#0ea5e9', 'W-', 'plumbing', 20, true),
  ('00000000-0000-4000-8000-000000000034'::uuid, 'appliance', 'Техника', '#8b5cf6', 'A-', 'sockets', 30, true),
  ('00000000-0000-4000-8000-000000000034'::uuid, 'household_appliance', 'Бытовая техника', '#8b5cf6', 'BT-', 'sockets', 40, true),
  ('00000000-0000-4000-8000-000000000034'::uuid, 'furniture', 'Мебель', '#a16207', 'F-', 'furniture', 50, true),
  ('00000000-0000-4000-8000-000000000034'::uuid, 'window', 'Окна', '#10b981', 'WIN-', 'windows', 60, true),
  ('00000000-0000-4000-8000-000000000034'::uuid, 'hvac', 'Климат', '#f59e0b', 'A-', 'radiators', 70, true)
on conflict (apartment_id, id) do update set
  label = excluded.label,
  color = excluded.color,
  prefix = excluded.prefix,
  plan_mode_id = excluded.plan_mode_id,
  sort_order = excluded.sort_order,
  builtin = excluded.builtin,
  updated_at = now();
