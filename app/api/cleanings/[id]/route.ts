import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../../assets/access";
import type { CleaningRecurrence } from "@/lib/cleanings";
import { cleaningPayload, formatCleaningSchedule, serializeCleaning } from "../helpers";

function nextOccurrence(value: string, recurrence: CleaningRecurrence) {
  const next = new Date(value);
  if (recurrence === "weekly" || recurrence === "biweekly") {
    next.setUTCDate(next.getUTCDate() + (recurrence === "weekly" ? 7 : 14));
    return next;
  }
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, error, status, userEmail } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = cleaningPayload(body);
  if ("error" in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const { data: currentCleaning, error: currentError } = await admin
    .from("cleanings")
    .select("status")
    .eq("apartment_id", APARTMENT_ID)
    .eq("id", id)
    .maybeSingle();
  if (currentError || !currentCleaning) return NextResponse.json({ error: currentError?.message ?? "Уборка не найдена." }, { status: currentError ? 500 : 404 });

  const completedAt = ["completed", "accepted"].includes(normalized.row.status)
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date())
    : null;
  const { data, error: updateError } = await admin
    .from("cleanings")
    .update({ ...normalized.row, completed_at_label: completedAt, updated_at: new Date().toISOString() })
    .eq("apartment_id", APARTMENT_ID)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  const cleaning = serializeCleaning(data, request);
  let nextCleaning;
  if (normalized.row.status === "accepted" && currentCleaning.status !== "accepted" && normalized.row.recurrence !== "none" && normalized.row.scheduled_for_at) {
    const nextDate = nextOccurrence(normalized.row.scheduled_for_at, normalized.row.recurrence);
    const nextRow = {
      ...normalized.row,
      id: `clean-${randomUUID().slice(0, 8)}`,
      guest_token: randomBytes(24).toString("hex"),
      status: "offered",
      zone_results: [],
      completed_items: [],
      owner_feedback: null,
      scheduled_for_at: nextDate.toISOString(),
      scheduled_for_label: formatCleaningSchedule(nextDate),
      completed_at_label: null,
      recurs_from_id: id,
      apartment_id: APARTMENT_ID,
      created_by: userEmail,
      created_at_label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    };
    const { data: created, error: createError } = await admin.from("cleanings").insert(nextRow).select("*").single();
    if (createError && createError.code !== "23505") return NextResponse.json({ error: createError.message }, { status: 500 });
    if (created) {
      nextCleaning = serializeCleaning(created, request);
    }
  }
  return NextResponse.json({ cleaning, nextCleaning });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const { data: media } = await admin
    .from("cleaning_media")
    .select("storage_path")
    .eq("apartment_id", APARTMENT_ID)
    .eq("cleaning_id", id);
  const { error: deleteError } = await admin.from("cleanings").delete().eq("apartment_id", APARTMENT_ID).eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  if (media?.length) {
    await admin.storage.from("asset-media").remove(media.map((item) => item.storage_path));
  }
  return NextResponse.json({ ok: true });
}
