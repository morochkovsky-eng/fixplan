import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";
import { normalizeUtilityPeriod } from "@/lib/utility-period";

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
  currentRate?: number;
};

function normalizeMeter(value: unknown): MeterPayload | null {
  if (!value || typeof value !== "object") return null;
  const meter = value as Record<string, unknown>;
  const id = String(meter.id ?? "").trim();
  const label = String(meter.label ?? "").trim();
  const service = String(meter.service ?? "other");
  const status = String(meter.status ?? "due");
  const lastReading = Number(meter.lastReading);
  const currentRate = Number(meter.currentRate);

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
    currentRate: Number.isFinite(currentRate) ? currentRate : undefined,
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
  previous_value: number | string | null;
  consumption: number | string | null;
  rate: number | string | null;
  calculated_amount: number | string | null;
}, photoUrl = "") {
  return {
    id: reading.id,
    meterId: reading.meter_id,
    period: reading.period,
    value: Number(reading.value),
    submittedAt: reading.submitted_at_label,
    source: reading.source,
    note: reading.note ?? undefined,
    photoUrl: photoUrl || undefined,
    previousValue: reading.previous_value === null ? undefined : Number(reading.previous_value),
    consumption: reading.consumption === null ? undefined : Number(reading.consumption),
    rate: reading.rate === null ? undefined : Number(reading.rate),
    calculatedAmount: reading.calculated_amount === null ? undefined : Number(reading.calculated_amount),
  };
}

export async function POST(request: Request) {
  const { admin, apartmentId, userEmail, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let body: Record<string, unknown>;
  let photo: File | undefined;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    try {
      body = JSON.parse(String(formData.get("payload") ?? "{}")) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Некорректные данные показания." }, { status: 400 });
    }
    const candidate = formData.get("photo");
    photo = candidate instanceof File && candidate.size ? candidate : undefined;
  } else {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }
  const meter = normalizeMeter(body.meter);
  const meterId = String(body.meterId ?? meter?.id ?? "").trim();
  const period = normalizeUtilityPeriod(body.period);
  const source = String(body.source ?? "owner");
  const value = Number(body.value);

  if (!meter || meter.id !== meterId || !period) {
    return NextResponse.json({ error: "Не удалось определить счетчик и период." }, { status: 400 });
  }

  if (!Number.isFinite(value) || value < 0 || !sources.has(source)) {
    return NextResponse.json({ error: "Введите корректное показание." }, { status: 400 });
  }

  if (photo && (!photo.type.startsWith("image/") || photo.size > 15 * 1024 * 1024)) {
    return NextResponse.json({ error: "Фото показания должно быть изображением до 15 МБ." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim() || `reading-${randomUUID().slice(0, 8)}`;
  const [existingResult, storedMeterResult, latestReadingResult] = await Promise.all([
    admin
      .from("utility_readings")
      .select("photo_storage_path,previous_value,rate")
      .eq("apartment_id", apartmentId)
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("utility_meters")
      .select("last_reading,current_rate")
      .eq("apartment_id", apartmentId)
      .eq("id", meterId)
      .maybeSingle(),
    admin
      .from("utility_readings")
      .select("id")
      .eq("apartment_id", apartmentId)
      .eq("meter_id", meterId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (existingResult.error) return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  if (storedMeterResult.error) return NextResponse.json({ error: storedMeterResult.error.message }, { status: 500 });
  if (latestReadingResult.error) return NextResponse.json({ error: latestReadingResult.error.message }, { status: 500 });
  if (!storedMeterResult.data) return NextResponse.json({ error: "Счетчик не найден." }, { status: 404 });
  const existingReading = existingResult.data;
  const previousValueRaw = existingReading?.previous_value ?? storedMeterResult.data.last_reading;
  const previousValue = previousValueRaw === null ? null : Number(previousValueRaw);
  if (previousValue !== null && value < previousValue) {
    return NextResponse.json({ error: "Новое показание не может быть меньше предыдущего." }, { status: 400 });
  }
  const rateRaw = existingReading?.rate ?? storedMeterResult.data.current_rate;
  const rate = rateRaw === null ? null : Number(rateRaw);
  const consumption = previousValue === null ? null : value - previousValue;
  const calculatedAmount = consumption === null || rate === null ? null : consumption * rate;

  let photoStoragePath = existingReading?.photo_storage_path ?? "";
  if (photo) {
    const extension = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    photoStoragePath = `${apartmentId}/utility-readings/${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("asset-media").upload(
      photoStoragePath,
      await photo.arrayBuffer(),
      { contentType: photo.type, upsert: false },
    );
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const shouldUpdateLastReading = !existingReading || latestReadingResult.data?.id === id;
  const meterPatch: Record<string, unknown> = {
    status: "submitted",
    updated_at: new Date().toISOString(),
  };
  if (shouldUpdateLastReading) meterPatch.last_reading = value;
  const { error: meterError } = await admin
    .from("utility_meters")
    .update(meterPatch)
    .eq("apartment_id", apartmentId)
    .eq("id", meter.id);

  if (meterError) {
    if (photo) await admin.storage.from("asset-media").remove([photoStoragePath]);
    return NextResponse.json({ error: meterError.message }, { status: 500 });
  }

  const { data, error: readingError } = await admin
    .from("utility_readings")
    .upsert(
      {
        apartment_id: apartmentId,
        id,
        meter_id: meterId,
        period,
        value,
        previous_value: previousValue,
        consumption,
        rate,
        calculated_amount: calculatedAmount,
        submitted_at_label: String(body.submittedAt ?? "").trim(),
        source,
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
        photo_storage_path: photoStoragePath || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "apartment_id,id" },
    )
    .select("*")
    .single();

  if (readingError) {
    if (photo) await admin.storage.from("asset-media").remove([photoStoragePath]);
    return NextResponse.json({ error: readingError.message }, { status: 500 });
  }

  let document;
  let signedPhotoUrl = "";
  if (photo) {
    const mediaPatch = {
      storage_path: photoStoragePath,
      media_type: photo.type,
      caption: photo.name,
      created_by: userEmail,
      document_type: "other",
      document_note: `Показание: ${meter.label}, ${period}`,
    };
    const { data: existingMedia } = await admin
      .from("asset_media")
      .select("id")
      .eq("apartment_id", apartmentId)
      .eq("utility_reading_id", id)
      .maybeSingle();
    const mediaQuery = existingMedia
      ? admin.from("asset_media").update(mediaPatch).eq("id", existingMedia.id)
      : admin.from("asset_media").insert({
          apartment_id: apartmentId,
          asset_id: null,
          event_id: null,
          inspection_id: null,
          utility_reading_id: id,
          ...mediaPatch,
        });
    const { data: media, error: mediaError } = await mediaQuery.select("*").single();
    if (mediaError) {
      await admin.storage.from("asset-media").remove([photoStoragePath]);
      await admin.from("utility_readings").update({
        photo_storage_path: existingReading?.photo_storage_path ?? null,
      }).eq("apartment_id", apartmentId).eq("id", id);
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }
    const { data: signed } = await admin.storage.from("asset-media").createSignedUrl(photoStoragePath, 60 * 60);
    signedPhotoUrl = signed?.signedUrl ?? "";
    document = {
      id: media.id,
      utilityReadingId: id,
      url: signedPhotoUrl,
      filename: photo.name,
      mediaType: media.media_type,
      caption: media.caption,
      createdBy: media.created_by,
      createdAt: media.created_at,
      documentType: media.document_type,
      note: media.document_note,
    };
    if (existingReading?.photo_storage_path && existingReading.photo_storage_path !== photoStoragePath) {
      await admin.storage.from("asset-media").remove([existingReading.photo_storage_path]);
    }
  } else if (photoStoragePath) {
    const { data: signed } = await admin.storage.from("asset-media").createSignedUrl(photoStoragePath, 60 * 60);
    signedPhotoUrl = signed?.signedUrl ?? "";
  }

  return NextResponse.json({ reading: formatReading(data, signedPhotoUrl), document });
}
