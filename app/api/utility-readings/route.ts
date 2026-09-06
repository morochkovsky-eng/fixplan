import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../assets/access";

const services = new Set(["cold_water", "hot_water", "electricity", "heating", "other"]);
const sources = new Set(["owner", "telegram", "manual"]);
const meterStatuses = new Set(["due", "submitted", "overdue"]);

type MeterPayload = {
  id: string;
  service: string;
  label: string;
  serial: string;
  location: string;
  unit: string;
  nextDue: string;
  status: string;
  lastReading?: number;
};

function normalizeMeter(value: unknown): MeterPayload | null {
  if (!value || typeof value !== "object") return null;
  const meter = value as Record<string, unknown>;
  const id = String(meter.id ?? "").trim();
  const label = String(meter.label ?? "").trim();
  const service = String(meter.service ?? "other");
  const status = String(meter.status ?? "due");
  const lastReading = Number(meter.lastReading);

  if (!id || !label || !services.has(service) || !meterStatuses.has(status)) return null;

  return {
    id,
    label,
    service,
    status,
    serial: String(meter.serial ?? "").trim(),
    location: String(meter.location ?? "").trim(),
    unit: String(meter.unit ?? "").trim(),
    nextDue: String(meter.nextDue ?? "").trim(),
    lastReading: Number.isFinite(lastReading) ? lastReading : undefined,
  };
}

function formatReading(reading: {
  id: string;
  meter_id: string;
  period: string;
  value: number | string;
  submitted_at_label: string;
  source: string;
  note: string | null;
}) {
  return {
    id: reading.id,
    meterId: reading.meter_id,
    period: reading.period,
    value: Number(reading.value),
    submittedAt: reading.submitted_at_label,
    source: reading.source,
    note: reading.note ?? undefined,
  };
}

export async function POST(request: Request) {
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const meter = normalizeMeter(body.meter);
  const meterId = String(body.meterId ?? meter?.id ?? "").trim();
  const period = String(body.period ?? "").trim();
  const source = String(body.source ?? "owner");
  const value = Number(body.value);

  if (!meter || meter.id !== meterId || !period) {
    return NextResponse.json({ error: "Не удалось определить счетчик и период." }, { status: 400 });
  }

  if (!Number.isFinite(value) || value < 0 || !sources.has(source)) {
    return NextResponse.json({ error: "Введите корректное показание." }, { status: 400 });
  }

  const { error: meterError } = await admin.from("utility_meters").upsert(
    {
      apartment_id: APARTMENT_ID,
      id: meter.id,
      service: meter.service,
      label: meter.label,
      serial: meter.serial,
      location: meter.location,
      unit: meter.unit,
      next_due_label: meter.nextDue,
      status: "submitted",
      last_reading: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "apartment_id,id" },
  );

  if (meterError) {
    return NextResponse.json({ error: meterError.message }, { status: 500 });
  }

  const id = String(body.id ?? "").trim() || `reading-${randomUUID().slice(0, 8)}`;
  const { data, error: readingError } = await admin
    .from("utility_readings")
    .upsert(
      {
        apartment_id: APARTMENT_ID,
        id,
        meter_id: meterId,
        period,
        value,
        submitted_at_label: String(body.submittedAt ?? "").trim(),
        source,
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "apartment_id,id" },
    )
    .select("*")
    .single();

  if (readingError) {
    return NextResponse.json({ error: readingError.message }, { status: 500 });
  }

  return NextResponse.json({ reading: formatReading(data) });
}
