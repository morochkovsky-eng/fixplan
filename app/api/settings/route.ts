import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";

const usageModes = new Set(["living", "rented"]);
const currencies = new Set(["RUB", "EUR", "USD"]);
const timezones = new Set(["Europe/Moscow", "Europe/Madrid", "Europe/Berlin", "Asia/Dubai"]);

export async function PATCH(request: Request) {
  const { admin, apartmentId, role, error: accessError, status } = await requireApartmentAccess();
  if (!admin) return NextResponse.json({ error: accessError }, { status });
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Недостаточно прав для изменения объекта." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const address = String(body.address ?? "").trim();
  const usageMode = String(body.usageMode ?? "");
  const currency = String(body.currency ?? "");
  const timezone = String(body.timezone ?? "");

  if (!name || !address) {
    return NextResponse.json({ error: "Укажите название объекта и адрес." }, { status: 400 });
  }
  if (!usageModes.has(usageMode) || !currencies.has(currency) || !timezones.has(timezone)) {
    return NextResponse.json({ error: "Проверьте режим, валюту и часовой пояс." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("apartments")
    .update({ name, address, usage_mode: usageMode, currency, timezone })
    .eq("id", apartmentId)
    .select("name,address,usage_mode,currency,timezone")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    config: {
      serviceName: "FixPlan",
      objectName: data.address || data.name,
      apartmentName: data.name,
      address: data.address,
      usageMode: data.usage_mode,
      currency: data.currency,
      timezone: data.timezone,
    },
  });
}
