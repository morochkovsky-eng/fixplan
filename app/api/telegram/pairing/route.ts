import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { APARTMENT_ID, requireApartmentAccess } from "../../assets/access";

const roles = new Set(["owner", "cleaner", "master"]);

export async function POST(request: Request) {
  const { admin, error, status, userEmail, role: memberRole } = await requireApartmentAccess();
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
