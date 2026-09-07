import { NextResponse } from "next/server";
import { createUtilityBillRecord } from "@/lib/server/utility-bills";
import { requireApartmentAccess } from "../assets/access";

export async function POST(request: Request) {
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createUtilityBillRecord(admin, {
    apartmentId,
    payload: body,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ bill: result.bill });
}
