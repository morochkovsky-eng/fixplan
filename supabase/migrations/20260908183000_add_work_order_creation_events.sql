create or replace function public.record_work_order_creation_events()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.workflow = 'work_order' then
    insert into public.events (
      apartment_id,
      id,
      asset_id,
      inspection_id,
      type,
      date_label,
      title,
      body,
      master,
      created_at
    )
    select
      new.apartment_id,
      'evt-work-order-created-' || new.id || '-' || selected_asset_id,
      selected_asset_id,
      new.id,
      'master',
      new.created_at_label,
      'Создано задание мастеру',
      new.number || '. Мастер: ' || coalesce(nullif(trim(new.contractor), ''), 'не указан') ||
        case
          when nullif(trim(new.asset_instructions ->> selected_asset_id), '') is not null
            then '. Поручение: ' || trim(new.asset_instructions ->> selected_asset_id)
          else '.'
        end,
      nullif(trim(new.contractor), ''),
      new.created_at
    from unnest(new.allowed_asset_ids) as selected_asset_id
    on conflict (apartment_id, id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists inspections_record_work_order_creation_events on public.inspections;

create trigger inspections_record_work_order_creation_events
after insert on public.inspections
for each row
execute function public.record_work_order_creation_events();

insert into public.events (
  apartment_id,
  id,
  asset_id,
  inspection_id,
  type,
  date_label,
  title,
  body,
  master,
  created_at
)
select
  inspection.apartment_id,
  'evt-work-order-created-' || inspection.id || '-' || selected_asset_id,
  selected_asset_id,
  inspection.id,
  'master',
  inspection.created_at_label,
  'Создано задание мастеру',
  inspection.number || '. Мастер: ' || coalesce(nullif(trim(inspection.contractor), ''), 'не указан') ||
    case
      when nullif(trim(inspection.asset_instructions ->> selected_asset_id), '') is not null
        then '. Поручение: ' || trim(inspection.asset_instructions ->> selected_asset_id)
      else '.'
    end,
  nullif(trim(inspection.contractor), ''),
  inspection.created_at
from public.inspections as inspection
cross join lateral unnest(inspection.allowed_asset_ids) as selected_asset_id
where inspection.workflow = 'work_order'
on conflict (apartment_id, id) do nothing;
