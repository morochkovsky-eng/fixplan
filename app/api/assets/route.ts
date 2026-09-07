import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "./access";

const kinds = new Set([
  "socket",
  "switch",
  "light",
  "plumbing_fixture",
  "drain",
  "appliance",
  "furniture",
  "window",
  "radiator",
  "warm_floor",
  "ventilation",
  "hvac",
]);
const statuses = new Set(["ok", "attention", "in_progress", "needs_master"]);

function clampCoordinate(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.min(100, Math.max(0, number));
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalCost(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? cost : undefined;
}

function nextAssetCode(codes: string[]) {
  const used = new Set(codes.map((code) => code.trim().toLowerCase()));
  let number = 1;
  while (used.has(String(number))) number += 1;
  return String(number);
}

function normalizeAssetPayload(body: Record<string, unknown>) {
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const roomId = String(body.roomId ?? "living").trim() || "living";
  const category = String(body.category ?? "electric");
  const kind = String(body.kind ?? "socket");
  const status = String(body.status ?? "ok");

  if (!name) {
    return { error: "Укажите название узла." };
  }

  if (!/^[a-z0-9_-]+$/i.test(category) || !kinds.has(kind) || !statuses.has(status)) {
    return { error: "Некорректные параметры узла." };
  }

  return {
    asset: {
      code,
      name,
      room_id: roomId,
      category,
      kind,
      status,
      x: clampCoordinate(body.x),
      y: clampCoordinate(body.y),
      warranty_until: optionalText(body.warrantyUntil),
      master: optionalText(body.master),
      manufacturer: optionalText(body.manufacturer),
      model: optionalText(body.model),
      serial_number: optionalText(body.serialNumber),
      installed_at: optionalText(body.installedAt),
      purchase_cost: optionalCost(body.purchaseCost),
      photo_note: String(body.photoNote ?? "").trim(),
    },
  };
}

function formatAsset(asset: {
  id: string;
  code: string;
  name: string;
  room_id: string;
  category: string;
  kind: string | null;
  status: string;
  x: number | string;
  y: number | string;
  last_checked: string;
  warranty_until: string | null;
  master: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  installed_at: string | null;
  purchase_cost: number | string | null;
  photo_note: string;
}) {
  return {
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
    manufacturer: asset.manufacturer,
    model: asset.model,
    serialNumber: asset.serial_number,
    installedAt: asset.installed_at,
    purchaseCost: asset.purchase_cost === null ? undefined : Number(asset.purchase_cost),
    photoNote: asset.photo_note,
  };
}

export async function POST(request: Request) {
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = normalizeAssetPayload(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  if (normalized.asset.purchase_cost === undefined) {
    return NextResponse.json(
      { error: "Стоимость должна быть положительным числом." },
      { status: 400 },
    );
  }

  const { data: existingAssets, error: codesError } = await admin
    .from("assets")
    .select("code")
    .eq("apartment_id", apartmentId)
    .is("deleted_at", null);

  if (codesError) {
    return NextResponse.json({ error: codesError.message }, { status: 500 });
  }

  const existingCodes = (existingAssets ?? []).map((asset) => asset.code);
  if (!normalized.asset.code) {
    normalized.asset.code = nextAssetCode(existingCodes);
  } else if (
    existingCodes.some(
      (code) => code.trim().toLowerCase() === normalized.asset.code.toLowerCase(),
    )
  ) {
    return NextResponse.json({ error: `Номер ${normalized.asset.code} уже занят.` }, { status: 409 });
  }

  const { data, error: insertError } = await admin
    .from("assets")
    .insert({
      apartment_id: apartmentId,
      id: `asset-${randomUUID().slice(0, 8)}`,
      ...normalized.asset,
      last_checked: "не проверялось",
      deleted_at: null,
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ asset: formatAsset(data) });
}
