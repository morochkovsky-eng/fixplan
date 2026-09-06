import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CleaningPhotoPhase } from "@/lib/cleanings";

const phases = new Set<CleaningPhotoPhase>(["before", "after"]);
const maxFileSize = 15 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Сервис временно недоступен." }, { status: 500 });

  const formData = await request.formData();
  const file = formData.get("file");
  const phase = String(formData.get("phase") ?? "") as CleaningPhotoPhase;
  if (!(file instanceof File) || !phases.has(phase)) return NextResponse.json({ error: "Выберите фотографию." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Можно загрузить только изображение." }, { status: 400 });
  if (file.size > maxFileSize) return NextResponse.json({ error: "Файл должен быть меньше 15 МБ." }, { status: 400 });

  const { data: cleaning, error: cleaningError } = await admin.from("cleanings").select("apartment_id,id,cleaner,status").eq("guest_token", token).eq("mode", "managed").maybeSingle();
  if (cleaningError || !cleaning) return NextResponse.json({ error: "Уборка не найдена или ссылка недействительна." }, { status: 404 });
  if (["completed", "accepted"].includes(cleaning.status)) return NextResponse.json({ error: "Завершенную уборку нельзя изменять." }, { status: 409 });

  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${cleaning.apartment_id}/cleanings/${cleaning.id}/${phase}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from("asset-media").upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: media, error: mediaError } = await admin.from("cleaning_media").insert({ apartment_id: cleaning.apartment_id, cleaning_id: cleaning.id, phase, storage_path: storagePath, media_type: file.type, filename: file.name }).select("*").single();
  if (mediaError) {
    await admin.storage.from("asset-media").remove([storagePath]);
    return NextResponse.json({ error: mediaError.message }, { status: 500 });
  }
  const { data: signed } = await admin.storage.from("asset-media").createSignedUrl(storagePath, 60 * 60);
  if (cleaning.status === "scheduled") {
    await admin
      .from("cleanings")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("apartment_id", cleaning.apartment_id)
      .eq("id", cleaning.id);
  }
  return NextResponse.json({ photo: { id: media.id, phase: media.phase, url: signed?.signedUrl ?? "", filename: media.filename, createdAt: media.created_at } });
}
