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
