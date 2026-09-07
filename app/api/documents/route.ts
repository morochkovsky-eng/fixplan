import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";

const documentTypes = new Set([
  "passport",
  "manual",
  "warranty",
  "receipt",
  "invoice",
  "estimate",
  "act",
  "contract",
  "scheme",
  "other",
]);

const acceptedTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

function validDate(value: string) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function serializeDocument(row: Record<string, unknown>, url: string) {
  return {
    id: row.id,
    assetId: row.asset_id ?? undefined,
    utilityBillId: row.utility_bill_id ?? undefined,
    url,
    filename: String(row.storage_path ?? "").split("/").at(-1) ?? "Документ",
    mediaType: row.media_type ?? "application/octet-stream",
    caption: row.caption,
    createdBy: row.created_by,
    createdAt: row.created_at,
    documentType: row.document_type,
    issuedAt: row.document_issued_at ?? undefined,
    validUntil: row.document_valid_until ?? undefined,
    note: row.document_note ?? undefined,
  };
}

export async function POST(request: Request) {
  const { admin, apartmentId, userEmail, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });

  const formData = await request.formData();
  const assetId = String(formData.get("assetId") ?? "").trim();
  const documentType = String(formData.get("documentType") ?? "other");
  const issuedAt = String(formData.get("issuedAt") ?? "");
  const validUntil = String(formData.get("validUntil") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const files = formData.getAll("files").filter((file): file is File => file instanceof File);

  if (!documentTypes.has(documentType) || !validDate(issuedAt) || !validDate(validUntil)) {
    return NextResponse.json({ error: "Проверьте тип и даты документа." }, { status: 400 });
  }
  if (!files.length) return NextResponse.json({ error: "Прикрепите хотя бы один файл." }, { status: 400 });
  if (files.some((file) => file.size > 15 * 1024 * 1024)) {
    return NextResponse.json({ error: "Размер одного файла не должен превышать 15 МБ." }, { status: 400 });
  }
  if (files.some((file) => !file.type.startsWith("image/") && !acceptedTypes.has(file.type))) {
    return NextResponse.json({ error: "Поддерживаются PDF, изображения, Word, Excel и текстовые файлы." }, { status: 400 });
  }

  if (assetId) {
    const { data: asset } = await admin
      .from("assets")
      .select("id")
      .eq("apartment_id", apartmentId)
      .eq("id", assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!asset) return NextResponse.json({ error: "Узел не найден." }, { status: 404 });
  }

  const uploaded = [];
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const storagePath = `${apartmentId}/documents/${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("asset-media").upload(
      storagePath,
      await file.arrayBuffer(),
      { contentType: file.type || "application/octet-stream", upsert: false },
    );
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: row, error: insertError } = await admin.from("asset_media").insert({
      apartment_id: apartmentId,
      asset_id: assetId || null,
      event_id: null,
      inspection_id: null,
      storage_path: storagePath,
      media_type: file.type || "application/octet-stream",
      caption: file.name,
      created_by: userEmail,
      document_type: documentType,
      document_issued_at: issuedAt || null,
      document_valid_until: validUntil || null,
      document_note: note || null,
    }).select("*").single();
    if (insertError) {
      await admin.storage.from("asset-media").remove([storagePath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    const { data: signed } = await admin.storage.from("asset-media").createSignedUrl(storagePath, 60 * 60);
    uploaded.push(serializeDocument(row, signed?.signedUrl ?? ""));
  }

  return NextResponse.json({ documents: uploaded.filter((item) => item.url) });
}
