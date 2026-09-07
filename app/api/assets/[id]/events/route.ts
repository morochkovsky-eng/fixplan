import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../../access";

function todayLabel() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: assetId } = await params;
  const { admin, apartmentId, userEmail, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const formData = await request.formData();
  const eventId = String(formData.get("eventId") ?? `evt-${Date.now()}-${randomUUID()}`);
  const eventType = String(formData.get("type") ?? "comment");
  const title = String(formData.get("title") ?? "Комментарий");
  const body = String(formData.get("body") ?? "").trim() || "Добавлены фотографии без комментария.";
  const files = formData.getAll("files").filter((file): file is File => file instanceof File);

  const { data: asset, error: assetError } = await admin
    .from("assets")
    .select("id")
    .eq("apartment_id", apartmentId)
    .eq("id", assetId)
    .maybeSingle();

  if (assetError) {
    return NextResponse.json({ error: assetError.message }, { status: 500 });
  }

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const { data: event, error: eventError } = await admin
    .from("events")
    .upsert(
      {
        apartment_id: apartmentId,
        id: eventId,
        asset_id: assetId,
        inspection_id: null,
        type: eventType,
        date_label: todayLabel(),
        title,
        body,
        master: userEmail,
        photo: files.length ? { label: "фото", note: `${files.length} фото` } : null,
      },
      { onConflict: "apartment_id,id" },
    )
    .select("*")
    .single();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  const uploadedMedia = [];

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const storagePath = `${apartmentId}/${assetId}/manual/${eventId}/${randomUUID()}.${extension}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await admin.storage
      .from("asset-media")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: media, error: mediaError } = await admin
      .from("asset_media")
      .insert({
        apartment_id: apartmentId,
        asset_id: assetId,
        event_id: eventId,
        inspection_id: null,
        storage_path: storagePath,
        media_type: file.type || "image/jpeg",
        caption: file.name,
        created_by: userEmail,
      })
      .select("*")
      .single();

    if (mediaError) {
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }

    const { data: signed } = await admin.storage
      .from("asset-media")
      .createSignedUrl(storagePath, 60 * 60);

    uploadedMedia.push({
      id: media.id,
      assetId: media.asset_id,
      eventId: media.event_id,
      inspectionId: media.inspection_id,
      url: signed?.signedUrl ?? "",
      filename: storagePath.split("/").at(-1) ?? file.name,
      mediaType: media.media_type,
      caption: media.caption,
      createdBy: media.created_by,
      createdAt: media.created_at,
    });
  }

  return NextResponse.json({
    event: {
      id: event.id,
      assetId: event.asset_id,
      inspectionId: event.inspection_id,
      type: event.type,
      date: event.date_label,
      title: event.title,
      body: event.body,
      cost: event.cost ? Number(event.cost) : undefined,
      master: event.master,
      statusAfter: event.status_after,
      photo: event.photo,
    },
    media: uploadedMedia.filter((item) => item.url),
  });
}
