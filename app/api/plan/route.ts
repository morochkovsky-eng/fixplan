import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";

const maxFileSize = 25 * 1024 * 1024;
const allowedTypes = new Set([
  "application/pdf",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function extensionFor(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extension) return extension;
  if (file.type === "application/pdf") return "pdf";
  return "jpg";
}

export async function POST(request: Request) {
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Выберите схему квартиры." }, { status: 400 });
  }
  if (!allowedTypes.has(file.type)) {
    return NextResponse.json({ error: "Поддерживаются PDF и изображения." }, { status: 400 });
  }
  if (!file.size || file.size > maxFileSize) {
    return NextResponse.json({ error: "Размер файла должен быть не больше 25 МБ." }, { status: 400 });
  }

  const { data: apartment, error: apartmentError } = await admin
    .from("apartments")
    .select("plan_storage_path")
    .eq("id", apartmentId)
    .single();
  if (apartmentError) return NextResponse.json({ error: apartmentError.message }, { status: 500 });

  const storagePath = `${apartmentId}/plan/${randomUUID()}.${extensionFor(file)}`;
  const { error: uploadError } = await admin.storage
    .from("asset-media")
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { error: updateError } = await admin
    .from("apartments")
    .update({
      plan_storage_path: storagePath,
      plan_media_type: file.type,
      plan_original_name: file.name,
      plan_updated_at: new Date().toISOString(),
    })
    .eq("id", apartmentId);
  if (updateError) {
    await admin.storage.from("asset-media").remove([storagePath]);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (apartment.plan_storage_path?.startsWith(`${apartmentId}/plan/`)) {
    await admin.storage.from("asset-media").remove([apartment.plan_storage_path]);
  }

  const { data: signed } = await admin.storage
    .from("asset-media")
    .createSignedUrl(storagePath, 60 * 60);

  return NextResponse.json({
    plan: {
      url: signed?.signedUrl ?? "",
      mediaType: file.type,
      originalName: file.name,
    },
  });
}

export async function DELETE() {
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });

  const { data: apartment, error: apartmentError } = await admin
    .from("apartments")
    .select("plan_storage_path")
    .eq("id", apartmentId)
    .single();
  if (apartmentError) return NextResponse.json({ error: apartmentError.message }, { status: 500 });

  const { error: updateError } = await admin
    .from("apartments")
    .update({
      plan_storage_path: null,
      plan_media_type: null,
      plan_original_name: null,
      plan_updated_at: new Date().toISOString(),
    })
    .eq("id", apartmentId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (apartment.plan_storage_path?.startsWith(`${apartmentId}/plan/`)) {
    await admin.storage.from("asset-media").remove([apartment.plan_storage_path]);
  }

  return NextResponse.json({ plan: null });
}
