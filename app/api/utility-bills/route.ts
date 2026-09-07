import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createUtilityBillRecord, formatUtilityBill } from "@/lib/server/utility-bills";
import { requireApartmentAccess } from "../assets/access";

const maxReceiptSize = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const { admin, apartmentId, userEmail, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });

  const contentType = request.headers.get("content-type") ?? "";
  let payload: Record<string, unknown>;
  let receipt: File | undefined;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    payload = {
      service: formData.get("service"),
      period: formData.get("period"),
      amount: formData.get("amount"),
      dueDate: formData.get("dueDate"),
      status: "due",
      note: formData.get("note"),
    };
    const candidate = formData.get("receipt");
    receipt = candidate instanceof File && candidate.size ? candidate : undefined;
  } else {
    payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }

  if (receipt && receipt.size > maxReceiptSize) {
    return NextResponse.json({ error: "Размер квитанции не должен превышать 15 МБ." }, { status: 400 });
  }
  if (receipt && !receipt.type.startsWith("image/") && receipt.type !== "application/pdf") {
    return NextResponse.json({ error: "Квитанция должна быть изображением или PDF." }, { status: 400 });
  }

  let storagePath = "";
  if (receipt) {
    const extension = receipt.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    storagePath = `${apartmentId}/utility-bills/${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("asset-media").upload(
      storagePath,
      await receipt.arrayBuffer(),
      { contentType: receipt.type || "application/octet-stream", upsert: false },
    );
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    payload.receiptStoragePath = storagePath;
  }

  const result = await createUtilityBillRecord(admin, { apartmentId, payload });
  if (!("row" in result) || !result.row) {
    if (storagePath) await admin.storage.from("asset-media").remove([storagePath]);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  let document;
  let signedReceiptUrl = "";
  if (receipt && storagePath) {
    const { data: media, error: mediaError } = await admin.from("asset_media").insert({
      apartment_id: apartmentId,
      asset_id: null,
      event_id: null,
      inspection_id: null,
      utility_bill_id: result.row.id,
      storage_path: storagePath,
      media_type: receipt.type,
      caption: receipt.name,
      created_by: userEmail,
      document_type: "invoice",
      document_note: `Квитанция: ${result.row.service}, ${result.row.period}`,
    }).select("*").single();
    if (mediaError) {
      await admin.from("utility_bills").delete().eq("apartment_id", apartmentId).eq("id", result.row.id);
      await admin.storage.from("asset-media").remove([storagePath]);
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }
    const { data: signed } = await admin.storage.from("asset-media").createSignedUrl(storagePath, 60 * 60);
    signedReceiptUrl = signed?.signedUrl ?? "";
    document = {
      id: media.id,
      url: signedReceiptUrl,
      filename: storagePath.split("/").at(-1) ?? receipt.name,
      mediaType: media.media_type,
      caption: media.caption,
      createdBy: media.created_by,
      createdAt: media.created_at,
      documentType: media.document_type,
      utilityBillId: media.utility_bill_id,
      note: media.document_note,
    };
  }

  return NextResponse.json({ bill: formatUtilityBill(result.row, signedReceiptUrl), document });
}
