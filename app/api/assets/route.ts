import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "./access";

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

function normalizeAssetPayload(body: Record<string, unknown>) {
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const roomId = String(body.roomId ?? "living").trim() || "living";
  const category = String(body.category ?? "electric");
  const kind = String(body.kind ?? "socket");
  const status = String(body.status ?? "ok");

  if (!code || !name) {
    return { error: "Укажите код и название узла." };
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
    photoNote: asset.photo_note,
  };
}

export async function POST(request: Request) {
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = normalizeAssetPayload(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error: insertError } = await admin
    .from("assets")
    .insert({
      apartment_id: APARTMENT_ID,
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
