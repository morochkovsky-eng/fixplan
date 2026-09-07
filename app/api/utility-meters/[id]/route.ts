import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../../assets/access";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error }, { status });

  const { data: readings, error: readingError } = await admin
    .from("utility_readings")
    .select("id,photo_storage_path")
    .eq("apartment_id", apartmentId)
    .eq("meter_id", id);
  if (readingError) return NextResponse.json({ error: readingError.message }, { status: 500 });

  const readingIds = (readings ?? []).map((reading) => reading.id);
  if (readingIds.length) {
    const { error: mediaError } = await admin
      .from("asset_media")
      .delete()
      .eq("apartment_id", apartmentId)
      .in("utility_reading_id", readingIds);
    if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("utility_meters")
    .delete()
    .eq("apartment_id", apartmentId)
    .eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const storagePaths = (readings ?? [])
    .map((reading) => reading.photo_storage_path)
    .filter((path): path is string => Boolean(path));
  if (storagePaths.length) await admin.storage.from("asset-media").remove(storagePaths);

  return NextResponse.json({ ok: true, deletedReadingIds: readingIds });
}
