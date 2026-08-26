import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const APARTMENT_ID = "00000000-0000-4000-8000-000000000034";

type ContractorScope = "plumbing" | "electric" | "all" | "custom";

type InspectionRow = {
  id: string;
  number: string;
  title: string;
  created_at_label: string;
  completed_at_label?: string | null;
  created_by: string;
  contractor: string;
  contractor_phone?: string | null;
  scope: ContractorScope;
  status: "draft" | "sent" | "in_progress" | "completed" | "accepted";
  allowed_asset_ids: string[];
  summary: string;
  conclusion?: string | null;
  guest_token: string;
  result_ids: string[];
};

function appUrlFromRequest(request: Request) {
  return (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

async function requireApartmentAccess() {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  if (!supabase || !admin) {
    return { admin: null, userEmail: "", error: "Supabase is not configured", status: 500 };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { admin, userEmail: "", error: "Unauthorized", status: 401 };
  }

  const { data: membership, error: membershipError } = await admin
    .from("apartment_members")
    .select("role")
    .eq("apartment_id", APARTMENT_ID)
    .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
    .maybeSingle();

  if (membershipError || !membership) {
    return { admin, userEmail: user.email, error: "Apartment access denied", status: 403 };
  }

  return { admin, userEmail: user.email, error: "", status: 200 };
}

async function assetsForScope({
  admin,
  allowedAssetIds,
  scope,
}: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  allowedAssetIds?: string[];
  scope: ContractorScope;
}) {
  let query = admin
    .from("assets")
    .select("id")
    .eq("apartment_id", APARTMENT_ID)
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
    scope: inspection.scope,
    status: inspection.status,
    allowedAssetIds: inspection.allowed_asset_ids,
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
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    contractor?: string;
    contractorPhone?: string;
    scope?: ContractorScope;
    allowedAssetIds?: string[];
  };

  const { data: currentInspection, error: inspectionError } = await admin
    .from("inspections")
    .select("*")
    .eq("apartment_id", APARTMENT_ID)
    .eq("id", id)
    .maybeSingle();

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  }

  if (!currentInspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
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
    allowedAssetIds: body.allowedAssetIds,
    scope,
  });

  if (scopedAssets.error) {
    return NextResponse.json({ error: scopedAssets.error.message }, { status: 500 });
  }

  const { data: existingResults, error: resultsError } = await admin
    .from("inspection_results")
    .select("asset_id")
    .eq("apartment_id", APARTMENT_ID)
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
      scope,
      title: contractorPhone ? `${contractor} · ${contractorPhone}` : contractor,
      allowed_asset_ids: allowedAssetIds,
      summary: `Ссылка обновлена. В задании ${allowedAssetIds.length} узлов.`,
      updated_at: new Date().toISOString(),
    })
    .eq("apartment_id", APARTMENT_ID)
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
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const { error: unlinkError } = await admin
    .from("events")
    .update({ inspection_id: null })
    .eq("apartment_id", APARTMENT_ID)
    .eq("inspection_id", id);

  if (unlinkError) {
    return NextResponse.json({ error: unlinkError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("inspections")
    .delete()
    .eq("apartment_id", APARTMENT_ID)
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inspectionId: id });
}
