import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../../../access";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id: assetId, eventId } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
  };

  const nextTitle = body.title?.trim();
  const nextBody = body.body?.trim();

  if (!nextTitle && !nextBody) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (nextTitle) patch.title = nextTitle;
  if (nextBody) patch.body = nextBody;

  const { data: event, error: eventError } = await admin
    .from("events")
    .update(patch)
    .eq("apartment_id", apartmentId)
    .eq("asset_id", assetId)
    .eq("id", eventId)
    .select("*")
    .single();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
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
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id: assetId, eventId } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const { data: mediaRows, error: mediaReadError } = await admin
    .from("asset_media")
    .select("id,storage_path")
    .eq("apartment_id", apartmentId)
    .eq("asset_id", assetId)
    .eq("event_id", eventId);

  if (mediaReadError) {
    return NextResponse.json({ error: mediaReadError.message }, { status: 500 });
  }

  const storagePaths = (mediaRows ?? [])
    .map((item) => String(item.storage_path ?? ""))
    .filter(Boolean);

  if (storagePaths.length) {
    await admin.storage.from("asset-media").remove(storagePaths);
  }

  const { error: mediaDeleteError } = await admin
    .from("asset_media")
    .delete()
    .eq("apartment_id", apartmentId)
    .eq("asset_id", assetId)
    .eq("event_id", eventId);

  if (mediaDeleteError) {
    return NextResponse.json({ error: mediaDeleteError.message }, { status: 500 });
  }

  const { error: eventDeleteError } = await admin
    .from("events")
    .delete()
    .eq("apartment_id", apartmentId)
    .eq("asset_id", assetId)
    .eq("id", eventId);

  if (eventDeleteError) {
    return NextResponse.json({ error: eventDeleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    deletedEventId: eventId,
    deletedMediaIds: (mediaRows ?? []).map((item) => item.id),
  });
}
