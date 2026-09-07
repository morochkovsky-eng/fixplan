import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../../assets/access";

const documentTypes = new Set(["passport", "manual", "warranty", "receipt", "invoice", "estimate", "act", "contract", "scheme", "other"]);

function validDate(value: string) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const documentType = String(body.documentType ?? "other");
  const issuedAt = String(body.issuedAt ?? "");
  const validUntil = String(body.validUntil ?? "");
  const note = String(body.note ?? "").trim();
  if (!documentTypes.has(documentType) || !validDate(issuedAt) || !validDate(validUntil)) {
    return NextResponse.json({ error: "Проверьте тип и даты документа." }, { status: 400 });
  }
  const { data, error: updateError } = await admin.from("asset_media").update({
    document_type: documentType,
    document_issued_at: issuedAt || null,
    document_valid_until: validUntil || null,
    document_note: note || null,
  }).eq("apartment_id", apartmentId).eq("id", id).is("event_id", null).select("id").maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Документ не найден." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const { data, error: findError } = await admin
    .from("asset_media")
    .select("storage_path,utility_bill_id,utility_reading_id")
    .eq("apartment_id", apartmentId)
    .eq("id", id)
    .is("event_id", null)
    .maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Документ не найден." }, { status: 404 });
  if (data.utility_bill_id || data.utility_reading_id) {
    return NextResponse.json(
      { error: "Этот файл является первоисточником счета или показания и удаляется из соответствующей записи." },
      { status: 409 },
    );
  }
  const { error: deleteError } = await admin.from("asset_media").delete().eq("apartment_id", apartmentId).eq("id", id).is("event_id", null);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  await admin.storage.from("asset-media").remove([data.storage_path]);
  return NextResponse.json({ ok: true });
}
