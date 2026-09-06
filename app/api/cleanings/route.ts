import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../assets/access";
import { cleaningPayload, serializeCleaning } from "./helpers";

export async function POST(request: Request) {
  const { admin, error, status, userEmail } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = cleaningPayload(body);
  if ("error" in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const { data, error: insertError } = await admin.from("cleanings").insert({ apartment_id: APARTMENT_ID, id: `clean-${randomUUID().slice(0, 8)}`, created_by: userEmail, created_at_label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date()), guest_token: randomBytes(24).toString("hex"), ...normalized.row }).select("*").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ cleaning: serializeCleaning(data, request) });
}

