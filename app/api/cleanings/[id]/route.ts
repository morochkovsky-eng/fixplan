import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../../assets/access";
import { cleaningPayload, serializeCleaning } from "../helpers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = cleaningPayload(body);
  if ("error" in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 });

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
  return NextResponse.json({ cleaning: serializeCleaning(data, request) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const { error: deleteError } = await admin.from("cleanings").delete().eq("apartment_id", APARTMENT_ID).eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
