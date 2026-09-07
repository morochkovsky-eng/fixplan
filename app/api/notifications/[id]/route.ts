import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../../assets/access";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const { error: updateError } = await admin.from("notification_events").update({ read_at: new Date().toISOString() }).eq("apartment_id", apartmentId).eq("recipient", "owner").eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
