import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";

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
  const period = String(body.period ?? "").trim();
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
  const { data: existingReading, error: existingError } = await admin
    .from("utility_readings")
    .select("photo_storage_path")
    .eq("apartment_id", apartmentId)
    .eq("id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

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

  const { error: meterError } = await admin.from("utility_meters").upsert(
    {
      apartment_id: apartmentId,
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
