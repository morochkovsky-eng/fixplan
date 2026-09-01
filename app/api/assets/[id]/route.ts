import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../access";

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
  if (!Number.isFinite(number)) return undefined;
  return Math.min(100, Math.max(0, number));
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.code === "string") patch.code = body.code.trim();
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.roomId === "string") patch.room_id = body.roomId.trim();
  if (typeof body.photoNote === "string") patch.photo_note = body.photoNote.trim();
  if (typeof body.category === "string" && /^[a-z0-9_-]+$/i.test(body.category)) {
    patch.category = body.category;
  }
  if (typeof body.kind === "string" && kinds.has(body.kind)) patch.kind = body.kind;
  if (typeof body.status === "string" && statuses.has(body.status)) patch.status = body.status;

  const x = clampCoordinate(body.x);
  const y = clampCoordinate(body.y);
  if (x !== undefined) patch.x = x;
  if (y !== undefined) patch.y = y;

  if (patch.code === "" || patch.name === "") {
    return NextResponse.json({ error: "Укажите код и название узла." }, { status: 400 });
  }

  const { data, error: updateError } = await admin
    .from("assets")
    .update(patch)
    .eq("apartment_id", APARTMENT_ID)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ asset: formatAsset(data) });
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

  const { error: updateError } = await admin
    .from("assets")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("apartment_id", APARTMENT_ID)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
