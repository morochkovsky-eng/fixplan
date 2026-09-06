import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTelegramAssistant } from "@/lib/server/telegram-assistant";
import { sendTelegramMessage, type TelegramUpdate, type TelegramUser } from "@/lib/server/telegram";

function displayName(user: TelegramUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ");
}

async function connectAccount(admin: NonNullable<ReturnType<typeof createAdminClient>>, code: string, user: TelegramUser, chatId: number) {
  const now = new Date().toISOString();
  const { data: pairing, error } = await admin.from("telegram_pairing_codes").select("id,apartment_id,role").eq("code_hash", createHash("sha256").update(code).digest("hex")).is("used_at", null).gt("expires_at", now).maybeSingle();
  if (error || !pairing) return false;

  const { error: accountError } = await admin.from("telegram_accounts").upsert({
    telegram_user_id: user.id,
    apartment_id: pairing.apartment_id,
    chat_id: chatId,
    role: pairing.role,
    display_name: displayName(user),
    username: user.username ?? null,
    active: true,
    updated_at: now,
  }, { onConflict: "telegram_user_id" });
  if (accountError) throw new Error(accountError.message);
  await admin.from("telegram_pairing_codes").update({ used_at: now }).eq("id", pairing.id).is("used_at", null);
  return true;
}

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  const user = message?.from;
  if (!update || !message || !user) return NextResponse.json({ ok: true });

  const { error: updateError } = await admin.from("telegram_updates").insert({ update_id: update.update_id, telegram_user_id: user.id });
  if (updateError) {
    if (updateError.code !== "23505") return NextResponse.json({ error: updateError.message }, { status: 500 });
    const { data: existing } = await admin.from("telegram_updates").select("status").eq("update_id", update.update_id).maybeSingle();
    if (existing?.status !== "failed") return NextResponse.json({ ok: true, duplicate: true });
    const { error: retryError } = await admin.from("telegram_updates").update({ status: "processing", error: null, processed_at: null }).eq("update_id", update.update_id);
    if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
  }

  try {
    const text = message.text?.trim() ?? "";
    const startCode = text.match(/^\/start(?:\s+(.+))?$/i)?.[1];
    if (startCode) {
      const connected = await connectAccount(admin, startCode, user, message.chat.id);
      await sendTelegramMessage(message.chat.id, connected ? "FixPlan подключён. Теперь можно спрашивать об уборках или создать новую." : "Ссылка подключения недействительна или уже использована.");
    } else {
      const { data: account } = await admin.from("telegram_accounts").select("telegram_user_id,apartment_id,role,display_name").eq("telegram_user_id", user.id).eq("active", true).maybeSingle();
      if (!account) {
        await sendTelegramMessage(message.chat.id, "Сначала подключите FixPlan по персональной ссылке из веб-интерфейса.");
      } else if (message.voice) {
        await sendTelegramMessage(message.chat.id, "Голосовые сообщения подключим следующим шагом. Пока отправьте запрос текстом.");
      } else if (text) {
        const answer = await runTelegramAssistant(admin, account, text, new URL(request.url).origin);
        await sendTelegramMessage(message.chat.id, answer);
      }
    }
    await admin.from("telegram_updates").update({ status: "processed", processed_at: new Date().toISOString() }).eq("update_id", update.update_id);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Telegram error";
    await admin.from("telegram_updates").update({ status: "failed", error: detail.slice(0, 1000), processed_at: new Date().toISOString() }).eq("update_id", update.update_id);
    try {
      await sendTelegramMessage(message.chat.id, "Не удалось обработать запрос. Попробуйте ещё раз чуть позже.");
    } catch (sendError) {
      console.error("Unable to send Telegram error message", sendError);
    }
  }
  return NextResponse.json({ ok: true });
}
