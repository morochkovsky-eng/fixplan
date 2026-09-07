import { NextResponse } from "next/server";
import { formatUtilityBill } from "@/lib/server/utility-bills";
import { requireApartmentAccess } from "../assets/access";

function isMissingUtilityTable(
  error: { code?: string; message?: string } | null | undefined,
  table: string,
) {
  if (!error) return false;
  return error.code === "PGRST205" || error.message?.includes(table);
}

function isMissingTable(error: { code?: string; message?: string } | null | undefined, table: string) {
  if (!error) return false;
  return error.code === "PGRST205" || Boolean(error.message?.includes(table));
}

export async function GET() {
  const { admin, apartmentId, error: accessError, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error: accessError }, { status });

  const [
    assetsResult,
    categoriesResult,
    deletedAssetsResult,
    eventsResult,
    inspectionsResult,
    resultsResult,
    mediaResult,
    utilityBillsResult,
    utilityMetersResult,
    utilityReadingsResult,
    cleaningsResult,
    cleaningMediaResult,
  ] = await Promise.all([
    admin.from("assets").select("*").eq("apartment_id", apartmentId).is("deleted_at", null).order("code"),
    admin.from("asset_categories").select("*").eq("apartment_id", apartmentId).order("sort_order"),
    admin.from("assets").select("id").eq("apartment_id", apartmentId).not("deleted_at", "is", null),
    admin.from("events").select("*").eq("apartment_id", apartmentId).order("created_at", { ascending: false }),
    admin.from("inspections").select("*").eq("apartment_id", apartmentId).order("created_at", { ascending: false }),
    admin.from("inspection_results").select("*").eq("apartment_id", apartmentId).order("created_at", { ascending: false }),
    admin.from("asset_media").select("*").eq("apartment_id", apartmentId).order("created_at", { ascending: false }),
    admin.from("utility_bills").select("*").eq("apartment_id", apartmentId).order("due_date_label"),
    admin.from("utility_meters").select("*").eq("apartment_id", apartmentId).order("created_at"),
    admin.from("utility_readings").select("*").eq("apartment_id", apartmentId).order("created_at", { ascending: false }),
    admin.from("cleanings").select("*").eq("apartment_id", apartmentId).order("created_at", { ascending: false }),
    admin.from("cleaning_media").select("*").eq("apartment_id", apartmentId).order("created_at"),
  ]);

  const error =
    assetsResult.error ??
    categoriesResult.error ??
    deletedAssetsResult.error ??
    eventsResult.error ??
    inspectionsResult.error ??
    resultsResult.error ??
    mediaResult.error ??
    (isMissingUtilityTable(utilityBillsResult.error, "utility_bills") ? null : utilityBillsResult.error) ??
    (isMissingUtilityTable(utilityMetersResult.error, "utility_meters") ? null : utilityMetersResult.error) ??
    (isMissingUtilityTable(utilityReadingsResult.error, "utility_readings") ? null : utilityReadingsResult.error);

  const effectiveError =
    error ??
    (isMissingTable(cleaningsResult.error, "cleanings") ? null : cleaningsResult.error) ??
    (isMissingTable(cleaningMediaResult.error, "cleaning_media") ? null : cleaningMediaResult.error);

  if (effectiveError) {
    return NextResponse.json({ error: effectiveError.message }, { status: 500 });
  }

  const hasUtilityBillsTable = !isMissingUtilityTable(utilityBillsResult.error, "utility_bills");
  const hasUtilityMeters =
    !isMissingUtilityTable(utilityMetersResult.error, "utility_meters") &&
    Boolean(utilityMetersResult.data?.length);
  const hasUtilityReadingsTable = !isMissingUtilityTable(
    utilityReadingsResult.error,
    "utility_readings",
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const mediaRows = mediaResult.data ?? [];
  const signedMedia = await Promise.all(
    mediaRows.map(async (item) => {
      const { data } = await admin.storage
        .from("asset-media")
        .createSignedUrl(item.storage_path, 60 * 60);
      const pathParts = String(item.storage_path).split("/");
      return {
        id: item.id,
        assetId: item.asset_id,
        eventId: item.event_id,
        inspectionId: item.inspection_id ?? pathParts[2],
        url: data?.signedUrl ?? "",
        filename: pathParts.at(-1) ?? "Фото узла",
        mediaType: item.media_type ?? "image/jpeg",
        caption: item.caption,
        createdBy: item.created_by,
        createdAt: item.created_at,
      };
    }),
  );
  const signedCleaningMedia = await Promise.all(
    (cleaningMediaResult.data ?? []).map(async (item) => {
      const { data } = await admin.storage
        .from("asset-media")
        .createSignedUrl(item.storage_path, 60 * 60);
      return {
        id: item.id,
        cleaningId: item.cleaning_id,
        phase: item.phase,
        zone: item.zone ?? undefined,
        url: data?.signedUrl ?? "",
        filename: item.filename,
        createdAt: item.created_at,
      };
    }),
  );
  const signedUtilityBills = await Promise.all(
    (utilityBillsResult.data ?? []).map(async (bill) => {
      let signedReceiptUrl = "";
      if (bill.receipt_storage_path) {
        const { data } = await admin.storage
          .from("asset-media")
          .createSignedUrl(bill.receipt_storage_path, 60 * 60);
        signedReceiptUrl = data?.signedUrl ?? "";
      }
      return formatUtilityBill(bill, signedReceiptUrl);
    }),
  );
  const { data: apartment } = await admin
    .from("apartments")
    .select("name,address,plan_storage_path,plan_media_type,plan_original_name")
    .eq("id", apartmentId)
    .single();
  let planUrl = "";
  if (apartment?.plan_storage_path) {
    const { data: signedPlan } = await admin.storage
      .from("asset-media")
      .createSignedUrl(apartment.plan_storage_path, 60 * 60);
    planUrl = signedPlan?.signedUrl ?? "";
  }

  return NextResponse.json({
    config: {
      serviceName: "FixPlan",
      objectName: apartment?.address || apartment?.name || "Объект",
    },
    plan: apartment?.plan_storage_path
      ? {
          url: planUrl,
          mediaType: apartment.plan_media_type ?? "image/jpeg",
          originalName: apartment.plan_original_name ?? "Схема квартиры",
        }
      : null,
    deletedAssetIds: (deletedAssetsResult.data ?? []).map((asset) => asset.id),
    categories: (categoriesResult.data ?? []).map((category) => ({
      id: category.id,
      label: category.label,
      color: category.color,
      prefix: category.prefix,
      planModeId: category.plan_mode_id,
      builtin: category.builtin,
    })),
    assets: (assetsResult.data ?? []).map((asset) => ({
      id: asset.id,
      code: asset.code,
      name: asset.name,
      roomId: asset.room_id,
      category: asset.category,
      kind: asset.kind,
      status: asset.status,
      x: Number(asset.x),
      y: Number(asset.y),
      lastChecked: asset.last_checked,
      warrantyUntil: asset.warranty_until,
      master: asset.master,
      photoNote: asset.photo_note,
    })),
    events: (eventsResult.data ?? []).map((event) => ({
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
    })),
    media: signedMedia.filter((item) => item.url),
    inspections: (inspectionsResult.data ?? []).map((inspection) => ({
      id: inspection.id,
      number: inspection.number,
      title: inspection.title,
      createdAt: inspection.created_at_label,
      completedAt: inspection.completed_at_label,
      createdBy: inspection.created_by,
      contractor: inspection.contractor,
      contractorPhone: inspection.contractor_phone,
      workflow: inspection.workflow ?? "inspection",
      scope: inspection.scope,
      status: inspection.status,
      allowedAssetIds: inspection.allowed_asset_ids,
      assetInstructions: inspection.asset_instructions ?? {},
      summary: inspection.summary,
      conclusion: inspection.conclusion,
      link: `${appUrl.replace(/\/$/, "")}/guest/${inspection.guest_token}`,
      resultIds: inspection.result_ids,
    })),
    inspectionResults: (resultsResult.data ?? []).map((result) => ({
      id: result.id,
      inspectionId: result.inspection_id,
      assetId: result.asset_id,
      statusAfter: result.status_after,
      comment: result.comment,
      date: result.date_label,
      author: result.author,
      cost: result.cost ? Number(result.cost) : undefined,
      photoCount: result.photo_count,
    })),
    ...(hasUtilityBillsTable
      ? {
          utilityBills: signedUtilityBills,
        }
      : {}),
    ...(hasUtilityMeters
      ? {
          utilityMeters: (utilityMetersResult.data ?? []).map((meter) => ({
            id: meter.id,
            service: meter.service,
            label: meter.label,
            serial: meter.serial,
            location: meter.location,
            unit: meter.unit,
            nextDue: meter.next_due_label,
            status: meter.status,
            lastReading:
              meter.last_reading === null ? undefined : Number(meter.last_reading),
          })),
        }
      : {}),
    ...(hasUtilityReadingsTable
      ? {
          utilityReadings: (utilityReadingsResult.data ?? []).map((reading) => ({
            id: reading.id,
            meterId: reading.meter_id,
            period: reading.period,
            value: Number(reading.value),
            submittedAt: reading.submitted_at_label,
            source: reading.source,
            note: reading.note ?? undefined,
          })),
        }
      : {}),
    ...(!isMissingTable(cleaningsResult.error, "cleanings")
      ? {
          cleanings: (cleaningsResult.data ?? []).map((cleaning) => ({
            id: cleaning.id,
            title: cleaning.title,
            type: cleaning.type,
            mode: cleaning.mode,
            zones: cleaning.zones ?? [],
            zoneResults: cleaning.zone_results ?? [],
            checklist: cleaning.checklist ?? [],
            completedItems: cleaning.completed_items ?? [],
            supplies: cleaning.supplies ?? [],
            scheduledFor: cleaning.scheduled_for_label,
            scheduledAt: cleaning.scheduled_for_at ?? undefined,
            recurrence: cleaning.recurrence ?? "none",
            cleaner: cleaning.cleaner,
            cleanerPhone: cleaning.cleaner_phone ?? undefined,
            status: cleaning.status,
            cost: cleaning.cost == null ? undefined : Number(cleaning.cost),
            notes: cleaning.notes ?? undefined,
            ownerFeedback: cleaning.owner_feedback ?? undefined,
            requirePhotoBefore: cleaning.require_photo_before === true,
            requirePhotoAfter: cleaning.require_photo_after === true,
            link:
              cleaning.mode === "managed"
                ? `${appUrl.replace(/\/$/, "")}/cleaning/${cleaning.guest_token}`
                : undefined,
            createdAt: cleaning.created_at_label,
            completedAt: cleaning.completed_at_label ?? undefined,
            photos: signedCleaningMedia
              .filter((photo) => photo.cleaningId === cleaning.id && photo.url)
              .map((photo) => ({
                id: photo.id,
                phase: photo.phase,
                zone: photo.zone,
                url: photo.url,
                filename: photo.filename,
                createdAt: photo.createdAt,
              })),
          })),
        }
      : {}),
  });
}
