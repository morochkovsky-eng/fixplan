import type { CleaningMode, CleaningStatus, CleaningType } from "@/lib/cleanings";

const types = new Set<CleaningType>(["standard", "deep", "post_renovation", "turnover"]);
const modes = new Set<CleaningMode>(["managed", "record_only"]);
const statuses = new Set<CleaningStatus>(["draft", "scheduled", "in_progress", "completed", "accepted"]);

function textArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

export function cleaningPayload(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  const type = String(body.type ?? "standard") as CleaningType;
  const mode = String(body.mode ?? "managed") as CleaningMode;
  const status = String(body.status ?? "scheduled") as CleaningStatus;
  const cleaner = String(body.cleaner ?? "").trim();
  const cost = body.cost === "" || body.cost == null ? null : Number(body.cost);
  const checklist = textArray(body.checklist);
  if (!title || !types.has(type) || !modes.has(mode) || !statuses.has(status)) return { error: "Проверьте название, тип, режим и статус уборки." };
  if (!checklist.length) return { error: "Добавьте хотя бы один пункт чек-листа." };
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return { error: "Укажите корректную стоимость." };
  return { row: { title, type, mode, zones: textArray(body.zones), checklist, completed_items: textArray(body.completedItems), supplies: textArray(body.supplies), scheduled_for_label: String(body.scheduledFor ?? "").trim(), cleaner, cleaner_phone: String(body.cleanerPhone ?? "").trim() || null, status, cost, notes: String(body.notes ?? "").trim() || null } };
}

export function serializeCleaning(row: Record<string, unknown>, request: Request) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  return { id: row.id, title: row.title, type: row.type, mode: row.mode, zones: row.zones ?? [], checklist: row.checklist ?? [], completedItems: row.completed_items ?? [], supplies: row.supplies ?? [], scheduledFor: row.scheduled_for_label, cleaner: row.cleaner, cleanerPhone: row.cleaner_phone ?? undefined, status: row.status, cost: row.cost == null ? undefined : Number(row.cost), notes: row.notes ?? undefined, link: row.mode === "managed" ? `${appUrl}/cleaning/${row.guest_token}` : undefined, createdAt: row.created_at_label, completedAt: row.completed_at_label ?? undefined, photos: [] };
}
