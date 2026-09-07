import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../access";

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

function optionalCost(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? cost : undefined;
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.code === "string" && body.code.trim()) patch.code = body.code.trim();
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.roomId === "string") patch.room_id = body.roomId.trim();
  if (typeof body.photoNote === "string") patch.photo_note = body.photoNote.trim();
  if (typeof body.warrantyUntil === "string") {
    patch.warranty_until = body.warrantyUntil.trim() || null;
  }
  if (typeof body.master === "string") {
    patch.master = body.master.trim() || null;
  }
  if (typeof body.manufacturer === "string") {
    patch.manufacturer = body.manufacturer.trim() || null;
  }
  if (typeof body.model === "string") patch.model = body.model.trim() || null;
  if (typeof body.serialNumber === "string") {
    patch.serial_number = body.serialNumber.trim() || null;
  }
  if (typeof body.installedAt === "string") {
    patch.installed_at = body.installedAt.trim() || null;
  }
  if ("purchaseCost" in body) {
    const purchaseCost = optionalCost(body.purchaseCost);
    if (purchaseCost === undefined) {
      return NextResponse.json(
        { error: "Стоимость должна быть положительным числом." },
        { status: 400 },
      );
    }
    patch.purchase_cost = purchaseCost;
  }
  if (typeof body.category === "string" && /^[a-z0-9_-]+$/i.test(body.category)) {
    patch.category = body.category;
  }
  if (typeof body.kind === "string" && kinds.has(body.kind)) patch.kind = body.kind;
  if (typeof body.status === "string" && statuses.has(body.status)) patch.status = body.status;

  const x = clampCoordinate(body.x);
  const y = clampCoordinate(body.y);
  if (x !== undefined) patch.x = x;
  if (y !== undefined) patch.y = y;

  if (patch.name === "") {
    return NextResponse.json({ error: "Укажите название узла." }, { status: 400 });
  }

  if (typeof patch.code === "string") {
    const patchCode = patch.code;
    const { data: existingAssets, error: codesError } = await admin
      .from("assets")
      .select("code")
      .eq("apartment_id", apartmentId)
      .neq("id", id)
      .is("deleted_at", null);

    if (codesError) {
      return NextResponse.json({ error: codesError.message }, { status: 500 });
    }

    if (
      (existingAssets ?? []).some(
        (asset) => asset.code.trim().toLowerCase() === patchCode.toLowerCase(),
      )
    ) {
      return NextResponse.json({ error: `Номер ${patchCode} уже занят.` }, { status: 409 });
    }
  }

  const { data, error: updateError } = await admin
    .from("assets")
    .update(patch)
    .eq("apartment_id", apartmentId)
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
  const { admin, apartmentId, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const { error: updateError } = await admin
    .from("assets")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("apartment_id", apartmentId)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
