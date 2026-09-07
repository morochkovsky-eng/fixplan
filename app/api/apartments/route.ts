import { NextResponse } from "next/server";
import { APARTMENT_COOKIE, getSelectedApartmentId } from "../assets/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const defaultRooms = [
  ["living", "Гостиная"],
  ["kitchen", "Кухня"],
  ["bath", "Санузел"],
  ["bedroom", "Спальня"],
  ["hall", "Прихожая"],
  ["office", "Кабинет"],
  ["laundry", "Постирочная"],
] as const;

const defaultCategories = [
  ["electric", "Электрика", "#0070f3", "R-", "sockets"],
  ["plumbing", "Сантехника", "#0ea5e9", "W-", "plumbing"],
  ["appliance", "Техника", "#8b5cf6", "A-", "sockets"],
  ["household_appliance", "Бытовая техника", "#8b5cf6", "BT-", "sockets"],
  ["furniture", "Мебель", "#a16207", "F-", "furniture"],
  ["window", "Окна", "#10b981", "WIN-", "windows"],
  ["hvac", "Климат", "#f59e0b", "A-", "radiators"],
] as const;

async function authenticatedContext() {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return { error: "Supabase is not configured", status: 500 } as const;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Unauthorized", status: 401 } as const;
  return { admin, user: { id: user.id, email: user.email } } as const;
}

async function accessibleApartments(admin: NonNullable<ReturnType<typeof createAdminClient>>, user: { id: string; email: string }) {
  const { data: memberships, error } = await admin
    .from("apartment_members")
    .select("apartment_id,role")
    .or(`user_id.eq.${user.id},email.ilike.${user.email}`);
  if (error) return { error: error.message } as const;
  const roleById = new Map((memberships ?? []).map((item) => [item.apartment_id, item.role]));
  if (!roleById.size) return { apartments: [] } as const;
  const { data, error: apartmentsError } = await admin
    .from("apartments")
    .select("id,name,address,created_at")
    .in("id", [...roleById.keys()])
    .order("created_at", { ascending: true });
  if (apartmentsError) return { error: apartmentsError.message } as const;
  return { apartments: (data ?? []).map((item) => ({ ...item, role: roleById.get(item.id) })) } as const;
}

export async function GET() {
  const context = await authenticatedContext();
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const result = await accessibleApartments(context.admin, context.user);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });
  const requestedId = await getSelectedApartmentId();
  const selectedId = result.apartments.some((item) => item.id === requestedId)
    ? requestedId
    : result.apartments[0]?.id;
  const response = NextResponse.json({ apartments: result.apartments, selectedId });
  if (selectedId && selectedId !== requestedId) response.cookies.set(APARTMENT_COOKIE, selectedId, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const address = String(body.address ?? "").trim();
  if (!name && !address) return NextResponse.json({ error: "Укажите название или адрес объекта." }, { status: 400 });
  const { data: apartment, error } = await context.admin.from("apartments").insert({
    name: name || address,
    address: address || name,
    created_by: context.user.id,
  }).select("id,name,address,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: memberError } = await context.admin.from("apartment_members").insert({
    apartment_id: apartment.id,
    user_id: context.user.id,
    email: context.user.email,
    role: "owner",
  });
  if (memberError) {
    await context.admin.from("apartments").delete().eq("id", apartment.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }
  const roomRows = defaultRooms.map(([id, roomName], index) => ({ apartment_id: apartment.id, id, name: roomName, sort_order: index, x: 0, y: 0, width: 1, height: 1 }));
  const categoryRows = defaultCategories.map(([id, label, color, prefix, planModeId], index) => ({ apartment_id: apartment.id, id, label, color, prefix, plan_mode_id: planModeId, sort_order: index, builtin: true }));
  const [roomsResult, categoriesResult] = await Promise.all([
    context.admin.from("rooms").insert(roomRows),
    context.admin.from("asset_categories").insert(categoryRows),
  ]);
  if (roomsResult.error || categoriesResult.error) {
    await context.admin.from("apartments").delete().eq("id", apartment.id);
    return NextResponse.json({ error: roomsResult.error?.message ?? categoriesResult.error?.message }, { status: 500 });
  }
  const response = NextResponse.json({ apartment: { ...apartment, role: "owner" } }, { status: 201 });
  response.cookies.set(APARTMENT_COOKIE, apartment.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}

export async function PATCH(request: Request) {
  const context = await authenticatedContext();
  if ("error" in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const apartmentId = String(body.apartmentId ?? "");
  const result = await accessibleApartments(context.admin, context.user);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });
  if (!result.apartments.some((item) => item.id === apartmentId)) return NextResponse.json({ error: "Объект недоступен." }, { status: 403 });
  const response = NextResponse.json({ selectedId: apartmentId });
  response.cookies.set(APARTMENT_COOKIE, apartmentId, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}
