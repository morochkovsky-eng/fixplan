import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../assets/access";

const statuses = new Set(["draft", "due", "paid", "overdue"]);

function normalizeBillPayload(body: Record<string, unknown>) {
  const service = String(body.service ?? "").trim();
  const period = String(body.period ?? "").trim();
  const status = String(body.status ?? "due");
  const amount = Number(body.amount ?? 0);

  if (!service || !period) {
    return { error: "Укажите услугу и период." };
  }

  if (!statuses.has(status) || !Number.isFinite(amount) || amount < 0) {
    return { error: "Некорректные параметры счета." };
  }

  return {
    bill: {
      service,
      period,
      amount,
      due_date_label: String(body.dueDate ?? "").trim(),
      paid_at_label: typeof body.paidAt === "string" && body.paidAt.trim() ? body.paidAt.trim() : null,
      status,
      receipt_url: typeof body.receiptUrl === "string" && body.receiptUrl.trim() ? body.receiptUrl.trim() : null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    },
  };
}

function formatBill(bill: {
  id: string;
  service: string;
  period: string;
  amount: number | string;
  due_date_label: string;
  paid_at_label: string | null;
  status: string;
  receipt_url: string | null;
  note: string | null;
}) {
  return {
    id: bill.id,
    service: bill.service,
    period: bill.period,
    amount: Number(bill.amount),
    dueDate: bill.due_date_label,
    paidAt: bill.paid_at_label ?? undefined,
    status: bill.status,
    receiptUrl: bill.receipt_url ?? undefined,
    note: bill.note ?? undefined,
  };
}

export async function POST(request: Request) {
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = normalizeBillPayload(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error: insertError } = await admin
    .from("utility_bills")
    .insert({
      apartment_id: APARTMENT_ID,
      id: `bill-${randomUUID().slice(0, 8)}`,
      ...normalized.bill,
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ bill: formatBill(data) });
}
