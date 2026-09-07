import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueNotification } from "@/lib/server/notifications";

type Status = "ok" | "attention" | "in_progress" | "needs_master";
type Workflow = "inspection" | "work_order";
const statuses = new Set<Status>(["ok", "attention", "in_progress", "needs_master"]);

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
  number: string;
  title: string;
  contractor: string;
  contractor_phone?: string | null;
  workflow?: Workflow | null;
  status: "draft" | "sent" | "in_progress" | "completed" | "accepted";
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

function normalizeCost(cost: GuestResultPayload["cost"]) {
  if (cost === "" || cost === null || typeof cost === "undefined") {
    return null;
  }

  const value = Number(cost);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function validateResult(result: GuestResultPayload) {
  if (!result.assetId || !statuses.has(result.statusAfter)) {
    return "Выберите результат по узлу.";
  }
  if (
    result.cost !== "" &&
    result.cost !== null &&
    result.cost !== undefined &&
    normalizeCost(result.cost) === null
  ) {
    return "Стоимость должна быть положительным числом.";
  }
  if (
    result.photoCount !== undefined &&
    (!Number.isInteger(result.photoCount) || result.photoCount < 0)
  ) {
    return "Некорректное количество фотографий.";
  }
  return null;
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
  const cost = normalizeCost(result.cost);
  const comment = result.comment?.trim() || (final
    ? "Мастер проверил узел без дополнительного комментария."
    : "");

  const { data: asset, error: assetError } = await admin
    .from("assets")
    .select("code,name,room_id,category")
    .eq("apartment_id", inspection.apartment_id)
    .eq("id", result.assetId)
    .is("deleted_at", null)
    .maybeSingle();

  if (assetError || !asset) {
    return { error: assetError?.message ?? "Узел больше недоступен.", resultId };
  }

  const { error: resultError } = await admin.from("inspection_results").upsert(
    {
      apartment_id: inspection.apartment_id,
      id: resultId,
      inspection_id: inspection.id,
      asset_id: result.assetId,
      asset_code: asset.code,
      asset_name: asset.name,
      room_id: asset.room_id,
      category: asset.category,
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
    .is("deleted_at", null)
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
      assetCode: result.asset_code,
      assetName: result.asset_name,
      roomId: result.room_id,
      category: result.category,
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

  if (inspection.status === "completed" || inspection.status === "accepted") {
    return NextResponse.json({ error: "Отчет уже отправлен и закрыт." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    conclusion?: string;
    results?: GuestResultPayload[];
  };
  const date = todayLabel();
  const allowed = new Set<string>(inspection.allowed_asset_ids ?? []);
  if (!allowed.size) {
    return NextResponse.json({ error: "В обходе нет доступных узлов." }, { status: 409 });
  }
  const { data: activeAssets, error: assetsError } = await admin
    .from("assets")
    .select("id")
    .eq("apartment_id", inspection.apartment_id)
    .in("id", Array.from(allowed))
    .is("deleted_at", null);

  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }

  const requiredAssetIds = new Set((activeAssets ?? []).map((asset) => asset.id));
  const resultsByAsset = new Map(
    (body.results ?? [])
      .filter((result) => requiredAssetIds.has(result.assetId))
      .map((result) => [result.assetId, result]),
  );
  const results = Array.from(requiredAssetIds).map((assetId) => resultsByAsset.get(assetId));

  if (!requiredAssetIds.size) {
    return NextResponse.json({ error: "В обходе не осталось доступных узлов." }, { status: 409 });
  }

  if (results.some((result) => !result)) {
    return NextResponse.json(
      { error: "Заполните результат по каждому узлу перед отправкой." },
      { status: 400 },
    );
  }

  const completeResults = results.filter((result): result is GuestResultPayload => Boolean(result));
  for (const result of completeResults) {
    const validationError = validateResult(result);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const resultIds: string[] = [];

  for (const result of completeResults) {
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
          ? `Мастер завершил задание: выполнено ${completeResults.length} из ${requiredAssetIds.size} узлов.`
          : `Мастер отправил отчет: проверено ${completeResults.length} из ${requiredAssetIds.size} узлов.`,
      result_ids: resultIds,
      updated_at: new Date().toISOString(),
    })
    .eq("apartment_id", inspection.apartment_id)
    .eq("id", inspection.id);

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  }

  const issueCount = completeResults.filter((result) =>
    result.statusAfter === "attention" || result.statusAfter === "needs_master"
  ).length;
  const isWorkOrder = inspection.workflow === "work_order";
  await enqueueNotification(admin, {
    apartmentId: inspection.apartment_id,
    kind: isWorkOrder ? "work_order.completed" : "inspection.completed",
    recipient: "owner",
    entityType: isWorkOrder ? "work_order" : "inspection",
    entityId: inspection.id,
    title: isWorkOrder ? "Задание мастера выполнено" : "Обход завершён",
    body: `${inspection.number} · ${inspection.contractor}\n${isWorkOrder ? "Выполнено" : "Проверено"} узлов: ${completeResults.length}. ${issueCount ? `Требуют внимания: ${issueCount}.` : "Проблем не отмечено."}`,
    actionUrl: "/",
    payload: { resultCount: completeResults.length, issueCount },
    dedupeKey: `${isWorkOrder ? "work-order" : "inspection"}:${inspection.id}:completed`,
  });

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

  if (inspection.status === "completed" || inspection.status === "accepted") {
    return NextResponse.json({ error: "Отчет уже отправлен и закрыт." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    result?: GuestResultPayload;
  };
  const result = body.result;
  const allowed = new Set<string>(inspection.allowed_asset_ids ?? []);

  if (!result?.assetId || !allowed.has(result.assetId)) {
    return NextResponse.json({ error: "Asset is not included in this inspection" }, { status: 400 });
  }

  const validationError = validateResult(result);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
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
