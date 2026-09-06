import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../../assets/access";

const roles = new Set(["owner", "cleaner", "master"]);

async function requireManager() {
  const access = await requireApartmentAccess();
  if (!access.admin) return { ...access, allowed: false };
  return { ...access, allowed: access.role === "owner" || access.role === "admin" };
}

export async function GET() {
  const access = await requireManager();
  if (!access.admin) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.allowed) return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });
  const { data, error } = await access.admin.from("telegram_accounts").select("telegram_user_id,role,display_name,username,active,created_at").eq("apartment_id", APARTMENT_ID).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: (data ?? []).map((account) => ({ telegramUserId: String(account.telegram_user_id), role: account.role, displayName: account.display_name, username: account.username ?? undefined, active: account.active, createdAt: account.created_at })) });
}

export async function POST(request: Request) {
  const { admin, error, status, userEmail, role: memberRole } = await requireManager();
  if (!admin) return NextResponse.json({ error }, { status });
  if (memberRole !== "owner" && memberRole !== "admin") return NextResponse.json({ error: "Только владелец или администратор может подключать Telegram." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const role = String(body.role ?? "owner");
  if (!roles.has(role)) return NextResponse.json({ error: "Неизвестная роль Telegram-пользователя." }, { status: 400 });

  const code = randomBytes(12).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error: insertError } = await admin.from("telegram_pairing_codes").insert({
    apartment_id: APARTMENT_ID,
    code_hash: createHash("sha256").update(code).digest("hex"),
    role,
    created_by: userEmail,
    expires_at: expiresAt,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  return NextResponse.json({ code, expiresAt, link: username ? `https://t.me/${username}?start=${code}` : undefined });
}

export async function DELETE(request: Request) {
  const access = await requireManager();
  if (!access.admin) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.allowed) return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const telegramUserId = String(body.telegramUserId ?? "").trim();
  if (!/^\d+$/.test(telegramUserId)) return NextResponse.json({ error: "Некорректный Telegram ID." }, { status: 400 });
  const { error } = await access.admin.from("telegram_accounts").delete().eq("apartment_id", APARTMENT_ID).eq("telegram_user_id", telegramUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
