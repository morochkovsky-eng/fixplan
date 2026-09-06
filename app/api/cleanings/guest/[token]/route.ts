import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

import type { CleaningPhoto } from "@/lib/cleanings";

function serialize(row: Record<string, unknown>, photos: CleaningPhoto[]) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    zones: row.zones ?? [],
    checklist: row.checklist ?? [],
    completedItems: row.completed_items ?? [],
    supplies: row.supplies ?? [],
    scheduledFor: row.scheduled_for_label,
    cleaner: row.cleaner,
    status: row.status,
    notes: row.notes ?? undefined,
    photos,
  };
}

async function signedPhotos(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  apartmentId: string,
  cleaningId: string,
) {
  const { data } = await admin.from("cleaning_media").select("*").eq("apartment_id", apartmentId).eq("cleaning_id", cleaningId).order("created_at");
  return Promise.all((data ?? []).map(async (item) => {
    const { data: signed } = await admin.storage.from("asset-media").createSignedUrl(item.storage_path, 60 * 60);
    return { id: item.id, phase: item.phase, url: signed?.signedUrl ?? "", filename: item.filename, createdAt: item.created_at } as CleaningPhoto;
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Сервис временно недоступен." }, { status: 500 });
  const { data, error } = await admin.from("cleanings").select("*").eq("guest_token", token).eq("mode", "managed").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Уборка не найдена или ссылка недействительна." }, { status: 404 });
  const photos = await signedPhotos(admin, data.apartment_id, data.id);
  return NextResponse.json({ cleaning: serialize(data, photos) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Сервис временно недоступен." }, { status: 500 });
  const body = (await request.json().catch(() => ({}))) as { completedItems?: unknown; status?: unknown };
  const completedItems = Array.isArray(body.completedItems) ? body.completedItems.map(String) : [];
  const status = body.status === "completed" ? "completed" : body.status === "in_progress" ? "in_progress" : undefined;
  const patch: Record<string, unknown> = { completed_items: completedItems, updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (status === "completed") patch.completed_at_label = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const { data, error } = await admin.from("cleanings").update(patch).eq("guest_token", token).eq("mode", "managed").select("*").single();
  if (error) return NextResponse.json({ error: "Не удалось сохранить прогресс." }, { status: 500 });
  const photos = await signedPhotos(admin, data.apartment_id, data.id);
  return NextResponse.json({ cleaning: serialize(data, photos) });
}
