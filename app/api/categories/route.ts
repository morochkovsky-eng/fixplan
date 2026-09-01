import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../assets/access";

const planModes = new Set([
  "sockets",
  "lighting",
  "plumbing",
  "ventilation",
  "furniture",
  "windows",
  "flooring",
  "radiators",
  "warmFloor",
]);

function normalizeCategoryPayload(body: Record<string, unknown>) {
  const id = String(body.id ?? "").trim();
  const label = String(body.label ?? "").trim();
  const color = String(body.color ?? "#0070f3").trim();
  const prefix = String(body.prefix ?? "").trim();
  const planModeId = String(body.planModeId ?? "sockets").trim();

  if (!id || !label) {
    return { error: "Укажите название категории." };
  }

  if (!/^[a-z0-9_-]+$/i.test(id)) {
    return { error: "Некорректный идентификатор категории." };
  }

  if (!planModes.has(planModeId)) {
    return { error: "Некорректный режим плана для категории." };
  }

  return {
    category: {
      id,
      label,
      color,
      prefix,
      plan_mode_id: planModeId,
      builtin: Boolean(body.builtin),
    },
  };
}

function formatCategory(category: {
  id: string;
  label: string;
  color: string;
  prefix: string;
  plan_mode_id: string;
  builtin: boolean;
}) {
  return {
    id: category.id,
    label: category.label,
    color: category.color,
    prefix: category.prefix,
    planModeId: category.plan_mode_id,
    builtin: category.builtin,
  };
}

export async function POST(request: Request) {
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = normalizeCategoryPayload(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error: insertError } = await admin
    .from("asset_categories")
    .insert({
      apartment_id: APARTMENT_ID,
      ...normalized.category,
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ category: formatCategory(data) });
}
