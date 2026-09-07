import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";

const services = new Set(["cold_water", "hot_water", "electricity", "heating", "other"]);

export async function POST(request: Request) {
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const label = String(body.label ?? "").trim();
  const service = String(body.service ?? "other");
  const lastReading = body.lastReading === "" || body.lastReading == null
    ? null
    : Number(body.lastReading);
  const currentRate = body.currentRate === "" || body.currentRate == null
    ? null
    : Number(body.currentRate);

  if (!label || !services.has(service)) {
    return NextResponse.json({ error: "Укажите название и тип счетчика." }, { status: 400 });
  }
  if (lastReading !== null && (!Number.isFinite(lastReading) || lastReading < 0)) {
    return NextResponse.json({ error: "Начальное показание должно быть неотрицательным числом." }, { status: 400 });
  }
  if (currentRate !== null && (!Number.isFinite(currentRate) || currentRate < 0)) {
    return NextResponse.json({ error: "Тариф должен быть неотрицательным числом." }, { status: 400 });
  }

  const { data, error: createError } = await admin
    .from("utility_meters")
    .insert({
      apartment_id: apartmentId,
      id: `meter-${randomUUID().slice(0, 8)}`,
      service,
      label,
      serial: String(body.serial ?? "").trim(),
      location: String(body.location ?? "").trim(),
      unit: String(body.unit ?? "").trim(),
      next_due_label: String(body.nextDue ?? "").trim(),
      status: "due",
      last_reading: lastReading,
      current_rate: currentRate,
    })
    .select("*")
    .single();

  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
  return NextResponse.json({
    meter: {
      id: data.id,
      service: data.service,
      label: data.label,
      serial: data.serial,
      location: data.location,
      unit: data.unit,
      nextDue: data.next_due_label,
      status: data.status,
      lastReading: data.last_reading === null ? undefined : Number(data.last_reading),
      currentRate: data.current_rate === null ? undefined : Number(data.current_rate),
    },
  });
}
