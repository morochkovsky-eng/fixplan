import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";

function serialize(row: Record<string, unknown>) {
  return { id: row.id, kind: row.kind, entityId: row.entity_id, title: row.title, body: row.body, actionUrl: row.action_url ?? undefined, readAt: row.read_at ?? undefined, createdAt: row.created_at };
}

export async function GET() {
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const { data, error: selectError } = await admin.from("notification_events").select("*").eq("apartment_id", apartmentId).eq("recipient", "owner").contains("channels", ["in_app"]).order("created_at", { ascending: false }).limit(30);
  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 });
  return NextResponse.json({ notifications: (data ?? []).map(serialize) });
}

export async function PATCH() {
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const { error: updateError } = await admin.from("notification_events").update({ read_at: new Date().toISOString() }).eq("apartment_id", apartmentId).eq("recipient", "owner").is("read_at", null);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
