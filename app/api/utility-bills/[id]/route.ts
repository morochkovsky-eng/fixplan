import { NextResponse } from "next/server";
import { formatUtilityBill } from "@/lib/server/utility-bills";
import { requireApartmentAccess } from "../../assets/access";

const statuses = new Set(["draft", "due", "paid", "overdue"]);

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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.service === "string") patch.service = body.service.trim();
  if (typeof body.period === "string") patch.period = body.period.trim();
  if (typeof body.amount !== "undefined") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Некорректная сумма счета." }, { status: 400 });
    }
    patch.amount = amount;
  }
  if (typeof body.dueDate === "string") patch.due_date_label = body.dueDate.trim();
  if (typeof body.paidAt === "string") patch.paid_at_label = body.paidAt.trim() || null;
  if (typeof body.receiptUrl === "string") patch.receipt_url = body.receiptUrl.trim() || null;
  if (typeof body.note === "string") patch.note = body.note.trim() || null;
  if (typeof body.status === "string" && statuses.has(body.status)) patch.status = body.status;

  if (patch.service === "" || patch.period === "") {
    return NextResponse.json({ error: "Укажите услугу и период." }, { status: 400 });
  }

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
