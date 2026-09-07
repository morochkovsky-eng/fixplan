import { NextResponse } from "next/server";
import { formatUtilityBill, normalizeBillPayload } from "@/lib/server/utility-bills";
import { requireApartmentAccess } from "../../assets/access";

const allowedStatusTransitions: Record<string, Set<string>> = {
  draft: new Set(["draft", "due"]),
  due: new Set(["due", "paid", "overdue"]),
  overdue: new Set(["overdue", "paid"]),
  paid: new Set(["paid"]),
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { data: current, error: findError } = await admin
    .from("utility_bills")
    .select("*")
    .eq("apartment_id", apartmentId)
    .eq("id", id)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Счет не найден." }, { status: 404 });

  const requestedStatus = typeof body.status === "string" ? body.status : current.status;
  if (!allowedStatusTransitions[current.status]?.has(requestedStatus)) {
    return NextResponse.json({ error: "Недопустимый переход статуса счета." }, { status: 409 });
  }

  const normalized = normalizeBillPayload({
    service: current.service,
    period: current.period,
    amount: current.amount,
    dueDate: current.due_date_label,
    paidAt: current.paid_at_label,
    status: current.status,
    receiptUrl: current.receipt_url,
    receiptStoragePath: current.receipt_storage_path,
    note: current.note,
    allocation: current.allocation,
    tenantAmount: current.tenant_amount,
    reimbursementStatus: current.reimbursement_status,
    reimbursedAt: current.reimbursed_at_label,
    source: current.source,
    ownerConfirmedAt: current.owner_confirmed_at,
    publishedAt: current.published_at,
    ...body,
  });
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const patch = { ...normalized.bill, updated_at: new Date().toISOString() };

  const { data, error: updateError } = await admin
    .from("utility_bills")
    .update(patch)
    .eq("apartment_id", apartmentId)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  let signedReceiptUrl = "";
  if (data.receipt_storage_path) {
    const { data: signed } = await admin.storage
      .from("asset-media")
      .createSignedUrl(data.receipt_storage_path, 60 * 60);
    signedReceiptUrl = signed?.signedUrl ?? "";
  }

  return NextResponse.json({ bill: formatUtilityBill(data, signedReceiptUrl) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const { error: detachError } = await admin
    .from("asset_media")
    .update({ utility_bill_id: null })
    .eq("apartment_id", apartmentId)
    .eq("utility_bill_id", id);

  if (detachError) {
    return NextResponse.json({ error: detachError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("utility_bills")
    .delete()
    .eq("apartment_id", apartmentId)
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
