import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../assets/access";
import { enqueueNotification } from "@/lib/server/notifications";
import { cleaningPayload, serializeCleaning } from "./helpers";

export async function POST(request: Request) {
  const { admin, error, status, userEmail } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = cleaningPayload(body);
  if ("error" in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const { data, error: insertError } = await admin.from("cleanings").insert({ apartment_id: APARTMENT_ID, id: `clean-${randomUUID().slice(0, 8)}`, created_by: userEmail, created_at_label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date()), guest_token: randomBytes(24).toString("hex"), ...normalized.row }).select("*").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const cleaning = serializeCleaning(data, request);
  if (data.mode === "managed" && data.status === "offered") {
    await enqueueNotification(admin, { apartmentId: APARTMENT_ID, kind: "cleaning.offered", recipient: "cleaner", entityId: data.id, title: "Новая уборка", body: `${data.title}${data.scheduled_for_label ? ` · ${data.scheduled_for_label}` : ""}`, actionUrl: cleaning.link, payload: { cleaner: data.cleaner, cleanerPhone: data.cleaner_phone, scheduledAt: data.scheduled_for_at }, dedupeKey: `cleaning:${data.id}:offered` });
  }
  return NextResponse.json({ cleaning });
}
