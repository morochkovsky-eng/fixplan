alter table public.utility_meters
  add column if not exists current_rate numeric;

alter table public.utility_readings
  add column if not exists previous_value numeric,
  add column if not exists consumption numeric,
  add column if not exists rate numeric,
  add column if not exists calculated_amount numeric;

alter table public.utility_meters
  drop constraint if exists utility_meters_current_rate_non_negative;

alter table public.utility_meters
  add constraint utility_meters_current_rate_non_negative
  check (current_rate is null or current_rate >= 0);

alter table public.utility_readings
  drop constraint if exists utility_readings_consumption_non_negative,
  drop constraint if exists utility_readings_rate_non_negative,
  drop constraint if exists utility_readings_calculated_amount_non_negative;

alter table public.utility_readings
  add constraint utility_readings_consumption_non_negative
  check (consumption is null or consumption >= 0),
  add constraint utility_readings_rate_non_negative
  check (rate is null or rate >= 0),
  add constraint utility_readings_calculated_amount_non_negative
  check (calculated_amount is null or calculated_amount >= 0);
