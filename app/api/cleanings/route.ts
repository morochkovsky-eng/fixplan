import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";
import { createCleaningRecord } from "@/lib/server/cleanings";

export async function POST(request: Request) {
  const { admin, apartmentId, error, status, userEmail } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createCleaningRecord(admin, { apartmentId, createdBy: userEmail, appOrigin: new URL(request.url).origin, payload: body });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ cleaning: result.cleaning });
}
