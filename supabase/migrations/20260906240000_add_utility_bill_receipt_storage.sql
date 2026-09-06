alter table public.utility_bills
add column if not exists receipt_storage_path text;
