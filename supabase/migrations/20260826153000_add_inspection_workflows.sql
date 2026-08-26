do $$
begin
  create type public.inspection_workflow as enum ('inspection', 'work_order');
exception
  when duplicate_object then null;
end $$;

alter table public.inspections
  add column if not exists workflow public.inspection_workflow not null default 'inspection',
  add column if not exists asset_instructions jsonb not null default '{}'::jsonb;
