import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Status = "ok" | "attention" | "in_progress" | "needs_master";
type Workflow = "inspection" | "work_order";

type GuestResultPayload = {
  assetId: string;
  statusAfter: Status;
  comment?: string;
  cost?: number | string | null;
  photoCount?: number;
};

type InspectionRow = {
  apartment_id: string;
  id: string;
  contractor: string;
  contractor_phone?: string | null;
  workflow?: Workflow | null;
  allowed_asset_ids?: string[];
  asset_instructions?: Record<string, string> | null;
};

function todayLabel() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function statusTitle(status: Status) {
  const labels: Record<Status, string> = {
    ok: "Исправно",
    attention: "Требует внимания",
    in_progress: "В работе",
    needs_master: "Нужен мастер",
  };
  return labels[status];
}

function normalizeCost(cost: GuestResultPayload["cost"]) {
  if (cost === "" || cost === null || typeof cost === "undefined") {
    return null;
  }

  const value = Number(cost);
  return Number.isFinite(value) ? value : null;
}

async function findInspection(token: string) {
  const admin = createAdminClient();

  if (!admin) {
    return { admin: null, inspection: null, error: "Supabase is not configured" };
  }

  const { data: inspection, error } = await admin
    .from("inspections")
    .select("*")
    .eq("guest_token", token)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (error) {
    return { admin, inspection: null, error: error.message };
  }

  if (!inspection) {
    return { admin, inspection: null, error: "Guest inspection not found or expired" };
  }

  return { admin, inspection, error: null };
}

async function saveGuestResult({
  admin,
  inspection,
  result,
  date,
  final = false,
}: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  inspection: InspectionRow;
  result: GuestResultPayload;
  date: string;
  final?: boolean;
}) {
  const resultId = `res-${inspection.id}-${result.assetId}`;
  const eventId = `evt-${inspection.id}-${result.assetId}`;
  const cost = normalizeCost(result.cost);
  const comment = result.comment?.trim() || (final
    ? "Мастер проверил узел без дополнительного комментария."
    : "");

  const { error: resultError } = await admin.from("inspection_results").upsert(
    {
      apartment_id: inspection.apartment_id,
      id: resultId,
      inspection_id: inspection.id,
      asset_id: result.assetId,
      status_after: result.statusAfter,
      comment,
      date_label: date,
      author: inspection.contractor,
      cost,
      photo_count: result.photoCount ?? 0,
    },
    { onConflict: "apartment_id,id" },
  );

  if (resultError) {
    return { error: resultError.message, resultId };
  }

  const { error: eventError } = await admin.from("events").upsert(
    {
      apartment_id: inspection.apartment_id,
      id: eventId,
      asset_id: result.assetId,
      inspection_id: inspection.id,
      type: "report",
      date_label: date,
      title: `${inspection.workflow === "work_order" ? "Задание мастера" : "Отчет мастера"}: ${statusTitle(result.statusAfter)}`,
      body: comment || "Мастер начал заполнять результат по узлу.",
      cost,
      master: inspection.contractor,
      status_after: result.statusAfter,
      photo:
        (result.photoCount ?? 0) > 0
          ? { label: "фото", note: `${result.photoCount} фото из обхода` }
          : null,
    },
    { onConflict: "apartment_id,id" },
  );

  if (eventError) {
    return { error: eventError.message, resultId };
  }

  const { error: assetError } = await admin
    .from("assets")
    .update({
      status: result.statusAfter,
      master: inspection.contractor,
      last_checked: date,
      updated_at: new Date().toISOString(),
    })
    .eq("apartment_id", inspection.apartment_id)
    .eq("id", result.assetId);

  if (assetError) {
    return { error: assetError.message, resultId };
  }

  return { resultId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { admin, inspection, error } = await findInspection(token);

  if (!admin) {
    return NextResponse.json({ error }, { status: 500 });
  }

  if (!inspection) {
    return NextResponse.json({ error }, { status: 404 });
  }

  if (inspection.status === "sent") {
    await admin
      .from("inspections")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("apartment_id", inspection.apartment_id)
      .eq("id", inspection.id);
    inspection.status = "in_progress";
  }

  const { data: assets, error: assetsError } = await admin
    .from("assets")
    .select("*")
    .eq("apartment_id", inspection.apartment_id)
    .in("id", inspection.allowed_asset_ids)
    .order("code", { ascending: true });

  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }

  const { data: existingResults, error: resultsError } = await admin
    .from("inspection_results")
    .select("*")
    .eq("apartment_id", inspection.apartment_id)
    .eq("inspection_id", inspection.id);

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  return NextResponse.json({
    inspection: {
      id: inspection.id,
      number: inspection.number,
      title: inspection.title,
      createdAt: inspection.created_at_label,
      completedAt: inspection.completed_at_label,
      contractor: inspection.contractor,
      contractorPhone: inspection.contractor_phone,
      workflow: inspection.workflow ?? "inspection",
      scope: inspection.scope,
      status: inspection.status,
      summary: inspection.summary,
      conclusion: inspection.conclusion,
      assetInstructions: inspection.asset_instructions ?? {},
    },
    assets: (assets ?? []).map((asset) => ({
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
      photoNote: asset.photo_note,
    })),
    results: (existingResults ?? []).map((result) => ({
      id: result.id,
      assetId: result.asset_id,
      statusAfter: result.status_after,
      comment: result.comment,
      cost: result.cost,
      photoCount: result.photo_count,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { admin, inspection, error } = await findInspection(token);

  if (!admin) {
    return NextResponse.json({ error }, { status: 500 });
  }

  if (!inspection) {
    return NextResponse.json({ error }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    conclusion?: string;
    results?: GuestResultPayload[];
  };
  const date = todayLabel();
  const allowed = new Set<string>(inspection.allowed_asset_ids ?? []);
  const results = (body.results ?? []).filter((result) => allowed.has(result.assetId));

  if (!results.length) {
    return NextResponse.json({ error: "No results submitted" }, { status: 400 });
  }

  const resultIds: string[] = [];

  for (const result of results) {
    const saved = await saveGuestResult({ admin, inspection, result, date, final: true });
    resultIds.push(saved.resultId);

    if (saved.error) {
      return NextResponse.json({ error: saved.error }, { status: 500 });
    }
  }

  const { error: inspectionError } = await admin
    .from("inspections")
    .update({
      status: "completed",
      completed_at_label: date,
      conclusion: body.conclusion?.trim() ?? "",
      summary:
        inspection.workflow === "work_order"
          ? `Мастер завершил задание: выполнено ${results.length} из ${allowed.size} узлов.`
          : `Мастер отправил отчет: проверено ${results.length} из ${allowed.size} узлов.`,
      result_ids: resultIds,
      updated_at: new Date().toISOString(),
    })
    .eq("apartment_id", inspection.apartment_id)
    .eq("id", inspection.id);

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inspectionId: inspection.id });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { admin, inspection, error } = await findInspection(token);

  if (!admin) {
    return NextResponse.json({ error }, { status: 500 });
  }

  if (!inspection) {
    return NextResponse.json({ error }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    result?: GuestResultPayload;
  };
  const result = body.result;
  const allowed = new Set<string>(inspection.allowed_asset_ids ?? []);

  if (!result?.assetId || !allowed.has(result.assetId)) {
    return NextResponse.json({ error: "Asset is not included in this inspection" }, { status: 400 });
  }

  const saved = await saveGuestResult({
    admin,
    inspection,
    result,
    date: todayLabel(),
  });

  if (saved.error) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  await admin
    .from("inspections")
    .update({
      status: "in_progress",
      summary:
        inspection.workflow === "work_order"
          ? "Мастер начал выполнять задание. Часть результатов уже сохранена."
          : "Мастер начал заполнять отчет. Часть результатов уже сохранена.",
      updated_at: new Date().toISOString(),
    })
    .eq("apartment_id", inspection.apartment_id)
    .eq("id", inspection.id);

  return NextResponse.json({ ok: true, resultId: saved.resultId });
}
