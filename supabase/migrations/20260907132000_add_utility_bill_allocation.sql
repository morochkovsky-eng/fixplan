alter table public.utility_bills
  add column if not exists allocation text not null default 'owner',
  add column if not exists tenant_amount numeric not null default 0,
  add column if not exists reimbursement_status text not null default 'not_required',
  add column if not exists reimbursed_at_label text,
  add column if not exists source text not null default 'web',
  add column if not exists owner_confirmed_at timestamptz,
  add column if not exists published_at timestamptz;

alter table public.utility_bills
  drop constraint if exists utility_bills_allocation_check,
  drop constraint if exists utility_bills_tenant_amount_check,
  drop constraint if exists utility_bills_reimbursement_status_check,
  drop constraint if exists utility_bills_source_check;

alter table public.utility_bills
  add constraint utility_bills_allocation_check
    check (allocation in ('owner', 'tenant', 'split')),
  add constraint utility_bills_tenant_amount_check
    check (tenant_amount >= 0 and tenant_amount <= amount),
  add constraint utility_bills_reimbursement_status_check
    check (reimbursement_status in ('not_required', 'awaiting', 'received')),
  add constraint utility_bills_source_check
    check (source in ('web', 'telegram_private', 'telegram_group'));
