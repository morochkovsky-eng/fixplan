import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApartmentAccess } from "../../assets/access";

type ContractorScope = "plumbing" | "electric" | "all" | "custom";
type Workflow = "inspection" | "work_order";
type InspectionStatus = "draft" | "sent" | "in_progress" | "completed" | "accepted";

type InspectionRow = {
  id: string;
  number: string;
  title: string;
  created_at_label: string;
  completed_at_label?: string | null;
  created_by: string;
  contractor: string;
  contractor_phone?: string | null;
  workflow?: Workflow | null;
  scope: ContractorScope;
  status: "draft" | "sent" | "in_progress" | "completed" | "accepted";
  allowed_asset_ids: string[];
  asset_instructions?: Record<string, string> | null;
  summary: string;
  conclusion?: string | null;
  guest_token: string;
  result_ids: string[];
};

type InspectionResultRow = {
  asset_id: string;
  status_after: "ok" | "attention" | "in_progress" | "needs_master";
  comment: string;
  date_label: string;
  author: string;
  cost?: number | string | null;
  photo_count: number;
};

const statusLabels: Record<InspectionResultRow["status_after"], string> = {
  ok: "Исправно",
  attention: "Требует внимания",
  in_progress: "В работе",
  needs_master: "Нужен мастер",
};

function appUrlFromRequest(request: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

async function assetsForScope({
  admin,
  apartmentId,
  allowedAssetIds,
  scope,
}: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  apartmentId: string;
  allowedAssetIds?: string[];
  scope: ContractorScope;
}) {
  let query = admin
    .from("assets")
    .select("id")
    .eq("apartment_id", apartmentId)
    .order("code", { ascending: true });

  if (scope === "plumbing") {
    query = query.eq("category", "plumbing");
  } else if (scope === "electric") {
    query = query.eq("category", "electric");
  } else if (scope === "custom" && allowedAssetIds?.length) {
    query = query.in("id", allowedAssetIds);
  }

  const { data, error } = await query;
  return { ids: (data ?? []).map((asset) => asset.id), error };
}

function serializeInspection(inspection: InspectionRow, request: Request) {
  return {
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
    link: `${appUrlFromRequest(request)}/guest/${inspection.guest_token}`,
    resultIds: inspection.result_ids,
  };
}

async function applyAcceptedResults({
  admin,
  apartmentId,
  inspection,
  results,
}: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  apartmentId: string;
  inspection: InspectionRow;
  results: InspectionResultRow[];
}) {
  for (const result of results) {
    const eventId = `evt-${inspection.id}-${result.asset_id}`;
    const { error: eventError } = await admin.from("events").upsert(
      {
        apartment_id: apartmentId,
        id: eventId,
        asset_id: result.asset_id,
        inspection_id: inspection.id,
        type: "report",
        date_label: result.date_label,
        title: `${inspection.workflow === "work_order" ? "Задание мастера" : "Отчет мастера"}: ${statusLabels[result.status_after]}`,
        body: result.comment || "Исполнитель завершил проверку без комментария.",
        cost: result.cost ?? null,
        master: result.author || inspection.contractor,
        status_after: result.status_after,
        photo:
          result.photo_count > 0
            ? {
                label: "фото",
                note: `${result.photo_count} фото из ${
                  inspection.workflow === "work_order" ? "задания" : "обхода"
                }`,
              }
            : null,
      },
      { onConflict: "apartment_id,id" },
    );
    if (eventError) return eventError.message;

    if (result.photo_count > 0) {
      const { error: mediaError } = await admin
        .from("asset_media")
        .update({ event_id: eventId })
        .eq("apartment_id", apartmentId)
        .eq("inspection_id", inspection.id)
        .eq("asset_id", result.asset_id);
      if (mediaError) return mediaError.message;
    }

    const { error: assetError } = await admin
      .from("assets")
      .update({
        status: result.status_after,
        master: result.author || inspection.contractor,
        last_checked: result.date_label,
        updated_at: new Date().toISOString(),
      })
      .eq("apartment_id", apartmentId)
      .eq("id", result.asset_id)
      .is("deleted_at", null);
    if (assetError) return assetError.message;
  }

  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    contractor?: string;
    contractorPhone?: string;
    scope?: ContractorScope;
    status?: InspectionStatus;
    allowedAssetIds?: string[];
    assetInstructions?: Record<string, string>;
  };

  const { data: currentInspection, error: inspectionError } = await admin
    .from("inspections")
    .select("*")
    .eq("apartment_id", apartmentId)
    .eq("id", id)
    .maybeSingle();

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  }

  if (!currentInspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  const workflow: Workflow = currentInspection.workflow === "work_order" ? "work_order" : "inspection";

  if (body.status === "accepted") {
    if (currentInspection.status !== "completed" && currentInspection.status !== "accepted") {
      return NextResponse.json({ error: "Only completed results can be accepted" }, { status: 409 });
    }

    const [{ data: results, error: resultsError }, { data: activeAssets, error: assetsError }] =
      await Promise.all([
        admin
          .from("inspection_results")
          .select("*")
          .eq("apartment_id", apartmentId)
          .eq("inspection_id", id),
        admin
          .from("assets")
          .select("id")
          .eq("apartment_id", apartmentId)
          .in("id", currentInspection.allowed_asset_ids)
          .is("deleted_at", null),
      ]);

    if (resultsError || assetsError) {
      return NextResponse.json(
        { error: resultsError?.message ?? assetsError?.message },
        { status: 500 },
      );
    }

    const resultAssetIds = new Set((results ?? []).map((result) => result.asset_id));
    if ((activeAssets ?? []).some((asset) => !resultAssetIds.has(asset.id))) {
      return NextResponse.json(
        { error: "Нельзя принять неполный отчет." },
        { status: 409 },
      );
    }

    const applyError = await applyAcceptedResults({
      admin,
      apartmentId,
      inspection: currentInspection,
      results: (results ?? []) as InspectionResultRow[],
    });
    if (applyError) {
      return NextResponse.json({ error: applyError }, { status: 500 });
    }

    const { data: inspection, error: acceptError } = await admin
      .from("inspections")
      .update({
        status: "accepted",
        summary:
          workflow === "work_order"
            ? "Задание принято владельцем. Результат сохранен в истории выбранных узлов."
            : "Отчет принят владельцем. Результат сохранен в истории выбранных узлов.",
        updated_at: new Date().toISOString(),
      })
      .eq("apartment_id", apartmentId)
      .eq("id", id)
      .select("*")
      .single();

    if (acceptError) {
      return NextResponse.json({ error: acceptError.message }, { status: 500 });
    }

    return NextResponse.json({ inspection: serializeInspection(inspection, request) });
  }

  if (body.status === "in_progress" && currentInspection.status === "completed") {
    const { data: inspection, error: returnError } = await admin
      .from("inspections")
      .update({
        status: "in_progress",
        completed_at_label: null,
        summary:
          workflow === "work_order"
            ? "Владелец вернул задание в работу. Исполнитель может уточнить результаты."
            : "Владелец вернул отчет в работу. Исполнитель может уточнить результаты.",
        updated_at: new Date().toISOString(),
      })
      .eq("apartment_id", apartmentId)
      .eq("id", id)
      .select("*")
      .single();

    if (returnError) {
      return NextResponse.json({ error: returnError.message }, { status: 500 });
    }

    return NextResponse.json({ inspection: serializeInspection(inspection, request) });
  }

  if (currentInspection.status === "completed" || currentInspection.status === "accepted") {
    return NextResponse.json({ error: "Completed inspections cannot be edited" }, { status: 409 });
  }

  const contractor = body.contractor?.trim() || currentInspection.contractor;
  const contractorPhone =
    typeof body.contractorPhone === "string"
      ? body.contractorPhone.trim() || null
      : currentInspection.contractor_phone;
  const scope = body.scope ?? currentInspection.scope;

  if (!contractor) {
    return NextResponse.json({ error: "Contractor name is required" }, { status: 400 });
  }

  const scopedAssets = await assetsForScope({
    admin,
    apartmentId,
    allowedAssetIds: body.allowedAssetIds,
    scope,
  });

  if (scopedAssets.error) {
    return NextResponse.json({ error: scopedAssets.error.message }, { status: 500 });
  }

  const { data: existingResults, error: resultsError } = await admin
    .from("inspection_results")
    .select("asset_id")
    .eq("apartment_id", apartmentId)
    .eq("inspection_id", id);

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  const ids = new Set(scopedAssets.ids);
  for (const result of existingResults ?? []) {
    ids.add(result.asset_id);
  }

  if (!ids.size) {
    return NextResponse.json({ error: "No assets selected" }, { status: 400 });
  }

  const allowedAssetIds = Array.from(ids);

  const { data: inspection, error: updateError } = await admin
    .from("inspections")
    .update({
      contractor,
      contractor_phone: contractorPhone,
      workflow,
      scope,
      title: contractorPhone ? `${contractor} · ${contractorPhone}` : contractor,
      allowed_asset_ids: allowedAssetIds,
      asset_instructions: body.assetInstructions ?? currentInspection.asset_instructions ?? {},
      summary:
        workflow === "work_order"
          ? `Задание обновлено. В работе ${allowedAssetIds.length} узлов.`
          : `Ссылка обновлена. В задании ${allowedAssetIds.length} узлов.`,
      updated_at: new Date().toISOString(),
    })
    .eq("apartment_id", apartmentId)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ inspection: serializeInspection(inspection, request) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const { error: unlinkError } = await admin
    .from("events")
    .update({ inspection_id: null })
    .eq("apartment_id", apartmentId)
    .eq("inspection_id", id);

  if (unlinkError) {
    return NextResponse.json({ error: unlinkError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("inspections")
    .delete()
    .eq("apartment_id", apartmentId)
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inspectionId: id });
}
