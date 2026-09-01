import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../../assets/access";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, string> = {};

  if (typeof body.label === "string" && body.label.trim()) {
    patch.label = body.label.trim();
  }

  if (typeof body.prefix === "string") {
    patch.prefix = body.prefix.trim();
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Нет изменений для категории." }, { status: 400 });
  }

  const { data, error: updateError } = await admin
    .from("asset_categories")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("apartment_id", APARTMENT_ID)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ category: formatCategory(data) });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { admin, error, status } = await requireApartmentAccess();

  if (!admin) {
    return NextResponse.json({ error }, { status });
  }

  const { id } = await context.params;
  const { count, error: countError } = await admin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("apartment_id", APARTMENT_ID)
    .eq("category", id)
    .is("deleted_at", null);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if (count) {
    return NextResponse.json(
      { error: "Нельзя удалить категорию, пока в ней есть узлы." },
      { status: 409 },
    );
  }

  const { error: deleteError } = await admin
    .from("asset_categories")
    .delete()
    .eq("apartment_id", APARTMENT_ID)
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
