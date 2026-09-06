import type { CleaningMode, CleaningRecurrence, CleaningStatus, CleaningType, CleaningZoneResult } from "@/lib/cleanings";

const types = new Set<CleaningType>(["standard", "deep", "post_renovation", "turnover"]);
const modes = new Set<CleaningMode>(["managed", "record_only"]);
const statuses = new Set<CleaningStatus>(["draft", "offered", "scheduled", "in_progress", "completed", "revision_requested", "accepted", "declined"]);
const recurrences = new Set<CleaningRecurrence>(["none", "weekly", "biweekly", "monthly"]);

export function formatCleaningSchedule(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(date);
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function zoneResults(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CleaningZoneResult[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const zone = String(source.zone ?? "").trim();
    const status = source.status === "done" || source.status === "issue" ? source.status : "pending";
    if (!zone) return [];
    return [{ zone, status, comment: String(source.comment ?? "").trim() }];
  });
}

export function cleaningPayload(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const type = String(body.type ?? "standard") as CleaningType;
  const mode = String(body.mode ?? "managed") as CleaningMode;
  const status = String(body.status ?? "scheduled") as CleaningStatus;
  const cleaner = String(body.cleaner ?? "").trim();
  const recurrence = String(body.recurrence ?? "none") as CleaningRecurrence;
  const scheduledAtValue = String(body.scheduledAt ?? "").trim();
  const scheduledAt = scheduledAtValue ? new Date(scheduledAtValue) : null;
  const cost = body.cost === "" || body.cost == null ? null : Number(body.cost);
  const checklist = textArray(body.checklist);
  const zones = textArray(body.zones);
  if (!title || !types.has(type) || !modes.has(mode) || !statuses.has(status) || !recurrences.has(recurrence)) return { error: "Проверьте название, тип, режим, статус и повторение уборки." };
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return { error: "Укажите корректные дату и время." };
  if (recurrence !== "none" && !scheduledAt) return { error: "Для повторяющейся уборки укажите дату и время." };
  if (!checklist.length) return { error: "Добавьте хотя бы один пункт чек-листа." };
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return { error: "Укажите корректную стоимость." };
  return { row: { title, type, mode, zones, zone_results: zoneResults(body.zoneResults).filter((result) => zones.includes(result.zone)), checklist, completed_items: textArray(body.completedItems), supplies: textArray(body.supplies), scheduled_for_label: scheduledAt ? formatCleaningSchedule(scheduledAt) : String(body.scheduledFor ?? "").trim(), scheduled_for_at: scheduledAt?.toISOString() ?? null, recurrence, cleaner, cleaner_phone: String(body.cleanerPhone ?? "").trim() || null, status, cost, notes: String(body.notes ?? "").trim() || null, owner_feedback: String(body.ownerFeedback ?? "").trim() || null, require_photo_before: body.requirePhotoBefore === true, require_photo_after: body.requirePhotoAfter === true } };
}

export function serializeCleaning(row: Record<string, unknown>, requestOrOrigin: Request | string) {
  const requestOrigin = typeof requestOrOrigin === "string" ? requestOrOrigin : new URL(requestOrOrigin.url).origin;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin).replace(/\/$/, "");
  return { id: row.id, title: row.title, type: row.type, mode: row.mode, zones: row.zones ?? [], zoneResults: row.zone_results ?? [], checklist: row.checklist ?? [], completedItems: row.completed_items ?? [], supplies: row.supplies ?? [], scheduledFor: row.scheduled_for_label, scheduledAt: row.scheduled_for_at ?? undefined, recurrence: row.recurrence ?? "none", cleaner: row.cleaner, cleanerPhone: row.cleaner_phone ?? undefined, status: row.status, cost: row.cost == null ? undefined : Number(row.cost), notes: row.notes ?? undefined, ownerFeedback: row.owner_feedback ?? undefined, requirePhotoBefore: row.require_photo_before === true, requirePhotoAfter: row.require_photo_after === true, link: row.mode === "managed" ? `${appUrl}/cleaning/${row.guest_token}` : undefined, createdAt: row.created_at_label, completedAt: row.completed_at_label ?? undefined, photos: [] };
}
