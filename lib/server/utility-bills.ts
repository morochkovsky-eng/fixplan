import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUtilityPeriod } from "@/lib/utility-period";

const statuses = new Set(["draft", "due", "paid", "overdue"]);
const allocations = new Set(["owner", "tenant", "split"]);
const reimbursementStatuses = new Set(["not_required", "awaiting", "received"]);
const sources = new Set(["web", "telegram_private", "telegram_group"]);

export type UtilityBillRow = {
  id: string;
  service: string;
  period: string;
  amount: number | string;
  due_date_label: string;
  paid_at_label: string | null;
  status: string;
  receipt_url: string | null;
  receipt_storage_path?: string | null;
  note: string | null;
  allocation: string;
  tenant_amount: number | string;
  reimbursement_status: string;
  reimbursed_at_label: string | null;
  source: string;
  owner_confirmed_at: string | null;
  published_at: string | null;
  created_at: string;
};

export function normalizeBillPayload(body: Record<string, unknown>) {
  const service = String(body.service ?? "").trim();
  const period = normalizeUtilityPeriod(body.period);
  const status = String(body.status ?? "due");
  const amount = Number(body.amount ?? 0);
  const allocation = String(body.allocation ?? "owner");
  const requestedTenantAmount = Number(body.tenantAmount ?? 0);
  const hasExplicitTenantAmount = body.tenantAmount !== undefined && body.tenantAmount !== null && String(body.tenantAmount).trim() !== "";
  const tenantAmount = allocation === "owner"
    ? 0
    : allocation === "tenant" && !hasExplicitTenantAmount
      ? amount
      : requestedTenantAmount;
  const requestedReimbursementStatus = String(
    body.reimbursementStatus ?? (tenantAmount > 0 ? "awaiting" : "not_required"),
  );
  const reimbursementStatus = tenantAmount > 0 ? requestedReimbursementStatus : "not_required";
  const source = String(body.source ?? "web");

  if (!service || !period) {
    return { error: "Укажите услугу и период." } as const;
  }

  if (
    !statuses.has(status) ||
    !allocations.has(allocation) ||
    !reimbursementStatuses.has(reimbursementStatus) ||
    !sources.has(source) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(tenantAmount) ||
    tenantAmount < 0 ||
    tenantAmount > amount
  ) {
    return { error: amount <= 0 ? "Сумма счета должна быть больше нуля." : "Некорректные параметры счета." } as const;
  }

  return {
    bill: {
      service,
      period,
      amount,
      due_date_label: String(body.dueDate ?? "").trim(),
      paid_at_label:
        typeof body.paidAt === "string" && body.paidAt.trim() ? body.paidAt.trim() : null,
      status,
      receipt_url:
        typeof body.receiptUrl === "string" && body.receiptUrl.trim()
          ? body.receiptUrl.trim()
          : null,
      receipt_storage_path:
        typeof body.receiptStoragePath === "string" && body.receiptStoragePath.trim()
          ? body.receiptStoragePath.trim()
          : null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
      allocation,
      tenant_amount: tenantAmount,
      reimbursement_status: reimbursementStatus,
      reimbursed_at_label:
        typeof body.reimbursedAt === "string" && body.reimbursedAt.trim()
          ? body.reimbursedAt.trim()
          : null,
      source,
      owner_confirmed_at:
        typeof body.ownerConfirmedAt === "string" && body.ownerConfirmedAt.trim()
          ? body.ownerConfirmedAt.trim()
          : null,
      published_at:
        typeof body.publishedAt === "string" && body.publishedAt.trim()
          ? body.publishedAt.trim()
          : null,
    },
  } as const;
}

export function formatUtilityBill(bill: UtilityBillRow, signedReceiptUrl?: string) {
  return {
    id: bill.id,
    service: bill.service,
    period: bill.period,
    amount: Number(bill.amount),
    dueDate: bill.due_date_label,
    paidAt: bill.paid_at_label ?? undefined,
    status: bill.status,
    receiptUrl: signedReceiptUrl || bill.receipt_url || undefined,
    note: bill.note ?? undefined,
    allocation: bill.allocation,
    tenantAmount: Number(bill.tenant_amount),
    reimbursementStatus: bill.reimbursement_status,
    reimbursedAt: bill.reimbursed_at_label ?? undefined,
    source: bill.source,
    ownerConfirmedAt: bill.owner_confirmed_at ?? undefined,
    publishedAt: bill.published_at ?? undefined,
    createdAt: bill.created_at,
  };
}

export async function createUtilityBillRecord(
  admin: SupabaseClient,
  options: { apartmentId: string; payload: Record<string, unknown> },
) {
  const normalized = normalizeBillPayload(options.payload);
  if ("error" in normalized) return { ...normalized, status: 400 } as const;

  const { data, error } = await admin
    .from("utility_bills")
    .insert({
      apartment_id: options.apartmentId,
      id: `bill-${randomUUID().slice(0, 8)}`,
      ...normalized.bill,
    })
    .select("*")
    .single();

  if (error) return { error: error.message, status: 500 } as const;
  return { row: data as UtilityBillRow, bill: formatUtilityBill(data as UtilityBillRow) };
}
