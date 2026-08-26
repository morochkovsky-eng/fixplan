import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const APARTMENT_ID = "00000000-0000-4000-8000-000000000034";

type ContractorScope = "plumbing" | "electric" | "all" | "custom";
type Workflow = "inspection" | "work_order";

function todayLabel() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  if (!supabase || !admin) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    workflow?: Workflow;
    scope?: ContractorScope;
    allowedAssetIds?: string[];
    assetInstructions?: Record<string, string>;
    contractor?: string;
    contractorPhone?: string;
  };

  const scope: ContractorScope = body.scope ?? "plumbing";
  const workflow: Workflow = body.workflow === "work_order" ? "work_order" : "inspection";
  const contractor = body.contractor?.trim() || "";
  const contractorPhone = body.contractorPhone?.trim() || null;

  if (!contractor) {
    return NextResponse.json({ error: "Contractor name is required" }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await admin
    .from("apartment_members")
    .select("role")
    .eq("apartment_id", APARTMENT_ID)
    .or(`user_id.eq.${user.id},email.ilike.${user.email}`)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Apartment access denied" }, { status: 403 });
  }

  let assetsQuery = admin
    .from("assets")
    .select("id")
    .eq("apartment_id", APARTMENT_ID)
    .order("code", { ascending: true });

  if (scope === "plumbing") {
    assetsQuery = assetsQuery.eq("category", "plumbing");
  } else if (scope === "electric") {
    assetsQuery = assetsQuery.eq("category", "electric");
  } else if (scope === "custom" && body.allowedAssetIds?.length) {
    assetsQuery = assetsQuery.in("id", body.allowedAssetIds);
  }

  const { data: assets, error: assetsError } = await assetsQuery;

  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }

  const allowedAssetIds = (assets ?? []).map((asset) => asset.id);

  if (!allowedAssetIds.length) {
    return NextResponse.json({ error: "No assets selected" }, { status: 400 });
  }

  const { count } = await admin
    .from("inspections")
    .select("id", { count: "exact", head: true })
    .eq("apartment_id", APARTMENT_ID);

  const id = `insp-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const token = randomBytes(24).toString("hex");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const link = `${appUrl.replace(/\/$/, "")}/guest/${token}`;
  const createdAt = todayLabel();

  const { data: inspection, error } = await admin
    .from("inspections")
    .insert({
      apartment_id: APARTMENT_ID,
      id,
      number: `Обход #${(count ?? 0) + 1}`,
      title: contractorPhone ? `${contractor} · ${contractorPhone}` : contractor,
      created_at_label: createdAt,
      created_by: user.email,
      contractor,
      contractor_phone: contractorPhone,
      workflow,
      scope,
      status: "sent",
      allowed_asset_ids: allowedAssetIds,
      asset_instructions: workflow === "work_order" ? body.assetInstructions ?? {} : {},
      summary:
        workflow === "work_order"
          ? "Задание создано. Ожидаем результат работы мастера по выбранным узлам."
          : "Ссылка создана. Ожидаем отчет мастера по выбранным узлам.",
      guest_token: token,
      result_ids: [],
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    inspection: {
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
      link,
      resultIds: inspection.result_ids,
    },
  });
}
