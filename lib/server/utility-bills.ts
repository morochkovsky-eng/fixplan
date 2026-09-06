import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const statuses = new Set(["draft", "due", "paid", "overdue"]);

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
};

export function normalizeBillPayload(body: Record<string, unknown>) {
  const service = String(body.service ?? "").trim();
  const period = String(body.period ?? "").trim();
  const status = String(body.status ?? "due");
  const amount = Number(body.amount ?? 0);

  if (!service || !period) {
    return { error: "Укажите услугу и период." } as const;
  }

  if (!statuses.has(status) || !Number.isFinite(amount) || amount < 0) {
    return { error: "Некорректные параметры счета." } as const;
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
