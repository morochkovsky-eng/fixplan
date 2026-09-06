import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    zones: row.zones ?? [],
    checklist: row.checklist ?? [],
    completedItems: row.completed_items ?? [],
    supplies: row.supplies ?? [],
    scheduledFor: row.scheduled_for_label,
    cleaner: row.cleaner,
    status: row.status,
    notes: row.notes ?? undefined,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Сервис временно недоступен." }, { status: 500 });
  const { data, error } = await admin.from("cleanings").select("*").eq("guest_token", token).eq("mode", "managed").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Уборка не найдена или ссылка недействительна." }, { status: 404 });
  return NextResponse.json({ cleaning: serialize(data) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Сервис временно недоступен." }, { status: 500 });
  const body = (await request.json().catch(() => ({}))) as { completedItems?: unknown; status?: unknown };
  const completedItems = Array.isArray(body.completedItems) ? body.completedItems.map(String) : [];
  const status = body.status === "completed" ? "completed" : body.status === "in_progress" ? "in_progress" : undefined;
  const patch: Record<string, unknown> = { completed_items: completedItems, updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (status === "completed") patch.completed_at_label = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const { data, error } = await admin.from("cleanings").update(patch).eq("guest_token", token).eq("mode", "managed").select("*").single();
  if (error) return NextResponse.json({ error: "Не удалось сохранить прогресс." }, { status: 500 });
  return NextResponse.json({ cleaning: serialize(data) });
}

