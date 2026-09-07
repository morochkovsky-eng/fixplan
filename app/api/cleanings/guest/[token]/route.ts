import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueNotification } from "@/lib/server/notifications";

import type { CleaningPhoto, CleaningZoneResult } from "@/lib/cleanings";

function serialize(row: Record<string, unknown>, photos: CleaningPhoto[]) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    zones: row.zones ?? [],
    zoneResults: row.zone_results ?? [],
    checklist: row.checklist ?? [],
    completedItems: row.completed_items ?? [],
    supplies: row.supplies ?? [],
    scheduledFor: row.scheduled_for_label,
    scheduledAt: row.scheduled_for_at ?? undefined,
    recurrence: row.recurrence ?? "none",
    cleaner: row.cleaner,
    status: row.status,
    cost: row.cost == null ? undefined : Number(row.cost),
    notes: row.notes ?? undefined,
    ownerFeedback: row.owner_feedback ?? undefined,
    requirePhotoBefore: row.require_photo_before === true,
    requirePhotoAfter: row.require_photo_after === true,
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
    return { id: item.id, phase: item.phase, zone: item.zone ?? undefined, url: signed?.signedUrl ?? "", filename: item.filename, createdAt: item.created_at } as CleaningPhoto;
  }));
}

function normalizeZoneResults(value: unknown): CleaningZoneResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CleaningZoneResult[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const zone = String(source.zone ?? "").trim();
    const zoneStatus = source.status === "done" || source.status === "issue" ? source.status : "pending";
    if (!zone) return [];
    return [{ zone, status: zoneStatus, comment: String(source.comment ?? "").trim() }];
  });
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
  const body = (await request.json().catch(() => ({}))) as { completedItems?: unknown; status?: unknown; zoneResults?: unknown };
  const completedItems = Array.isArray(body.completedItems) ? body.completedItems.map(String) : [];
  const requestedStatus = typeof body.status === "string" ? body.status : undefined;
  const zoneResults = normalizeZoneResults(body.zoneResults);
  const { data: currentCleaning, error: currentError } = await admin
    .from("cleanings")
    .select("apartment_id,id,title,zones,status,updated_at,require_photo_before,require_photo_after")
    .eq("guest_token", token)
    .eq("mode", "managed")
    .maybeSingle();
  if (currentError || !currentCleaning) return NextResponse.json({ error: "Уборка не найдена или ссылка недействительна." }, { status: 404 });
  const currentStatus = currentCleaning.status as string;
  const status =
    currentStatus === "offered" && requestedStatus === "scheduled" ? "scheduled" :
    currentStatus === "offered" && requestedStatus === "declined" ? "declined" :
    ["scheduled", "in_progress", "revision_requested"].includes(currentStatus) && requestedStatus === "in_progress" ? "in_progress" :
    ["scheduled", "in_progress", "revision_requested"].includes(currentStatus) && requestedStatus === "completed" ? "completed" :
    undefined;
  if (requestedStatus && !status) return NextResponse.json({ error: "Это действие недоступно для текущего статуса уборки." }, { status: 409 });
  if (status === "completed" && currentCleaning.zones.some((zone: string) => !zoneResults.some((result) => result.zone === zone && result.status !== "pending"))) {
    return NextResponse.json({ error: "Укажите результат по каждой зоне уборки." }, { status: 400 });
  }
  if (status === "completed" && (currentCleaning.require_photo_before || currentCleaning.require_photo_after)) {
    const { data: media, error: mediaError } = await admin
      .from("cleaning_media")
      .select("phase,zone")
      .eq("apartment_id", currentCleaning.apartment_id)
      .eq("cleaning_id", currentCleaning.id);
    if (mediaError) return NextResponse.json({ error: "Не удалось проверить фотографии." }, { status: 500 });
    const hasRequiredPhoto = (phase: "before" | "after", zone: string) => (media ?? []).some((item) => item.phase === phase && (!item.zone || item.zone === zone));
    if (currentCleaning.require_photo_before && currentCleaning.zones.some((zone: string) => !hasRequiredPhoto("before", zone))) return NextResponse.json({ error: "Добавьте обязательное фото до по каждой зоне." }, { status: 400 });
    if (currentCleaning.require_photo_after && currentCleaning.zones.some((zone: string) => !hasRequiredPhoto("after", zone))) return NextResponse.json({ error: "Добавьте обязательное фото после по каждой зоне." }, { status: 400 });
  }
  const patch: Record<string, unknown> = { completed_items: completedItems, updated_at: new Date().toISOString() };
  if (Array.isArray(body.zoneResults)) {
    const allowedZones = new Set(currentCleaning.zones);
    patch.zone_results = zoneResults.filter((result) => allowedZones.has(result.zone));
  }
  if (status) patch.status = status;
  if (status === "completed") {
    patch.completed_at_label = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
    patch.owner_feedback = null;
  }
  const { data, error } = await admin.from("cleanings").update(patch).eq("guest_token", token).eq("mode", "managed").select("*").single();
  if (error) return NextResponse.json({ error: "Не удалось сохранить прогресс." }, { status: 500 });
  if (status && status !== currentStatus) {
    const event = status === "scheduled" ? { kind: "cleaning.offer_accepted", title: "Клинер принял уборку" } : status === "declined" ? { kind: "cleaning.offer_declined", title: "Клинер отказался от уборки" } : status === "completed" ? { kind: "cleaning.completed", title: "Уборка завершена" } : currentStatus === "revision_requested" ? { kind: "cleaning.revision_started", title: "Клинер начал доработку" } : { kind: "cleaning.started", title: "Уборка начата" };
    const issueCount = zoneResults.filter((result) => result.status === "issue").length;
    const completionDetails = status === "completed"
      ? `${currentCleaning.title}\nЗон: ${currentCleaning.zones.length}. ${issueCount ? `С замечаниями: ${issueCount}.` : "Без замечаний."}`
      : currentCleaning.title;
    await enqueueNotification(admin, { apartmentId: currentCleaning.apartment_id, kind: event.kind, recipient: "owner", entityType: "cleaning", entityId: currentCleaning.id, title: event.title, body: completionDetails, actionUrl: "/", payload: { status, zones: currentCleaning.zones }, channels: status === "completed" ? ["in_app", "telegram"] : ["in_app"], dedupeKey: `cleaning:${currentCleaning.id}:${currentStatus}:${status}:${currentCleaning.updated_at}` });
  }
  const photos = await signedPhotos(admin, data.apartment_id, data.id);
  return NextResponse.json({ cleaning: serialize(data, photos) });
}
