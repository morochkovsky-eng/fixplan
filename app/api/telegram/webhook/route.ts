import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAssistantMessage } from "@/lib/server/assistant-messages";
import { utilityDraftReply } from "@/lib/server/assistant-replies";
import { runTelegramAssistant, type TelegramAssistantAttachment } from "@/lib/server/telegram-assistant";
import { getActiveTelegramApartment, type TelegramOwnerAccount } from "@/lib/server/telegram-context";
import {
  answerTelegramCallbackQuery,
  cleanTelegramDraftText,
  clearTelegramInlineKeyboard,
  downloadTelegramFile,
  sendTelegramMessage,
  transcribeTelegramVoice,
  type TelegramInlineButton,
  type TelegramUpdate,
  type TelegramUser,
} from "@/lib/server/telegram";

const supportedAttachmentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);
const draftKeyboard: TelegramInlineButton[][] = [[
  { text: "Создать", callback_data: "fixplan:pending:confirm" },
  { text: "Изменить", callback_data: "fixplan:pending:edit" },
  { text: "Отменить", callback_data: "fixplan:pending:cancel" },
]];
const utilityDraftKeyboard: TelegramInlineButton[][] = [[
  { text: "Создать счёт", callback_data: "fixplan:pending:confirm" },
  { text: "Удалить черновик", callback_data: "fixplan:pending:cancel" },
]];
const utilityInsuranceKeyboard: TelegramInlineButton[][] = [
  [
    { text: "Оставить страховку", callback_data: "fixplan:utility:insurance:keep" },
    { text: "Исключить страховку", callback_data: "fixplan:utility:insurance:exclude" },
  ],
  ...utilityDraftKeyboard,
];
const editDraftKeyboard: TelegramInlineButton[][] = [[
  { text: "Отменить черновик", callback_data: "fixplan:pending:cancel" },
]];

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "bill";
}

async function uploadTelegramAttachment(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  apartmentId: string,
  message: NonNullable<TelegramUpdate["message"]>,
) {
  const largestPhoto = message.photo?.at(-1);
  const document = message.document;
  if (!largestPhoto && !document) return undefined;
  const file = await downloadTelegramFile(largestPhoto?.file_id ?? document!.file_id, {
    filename: largestPhoto ? "telegram-photo.jpg" : document?.file_name,
    mimeType: largestPhoto ? "image/jpeg" : document?.mime_type,
  });
  if (!supportedAttachmentTypes.has(file.mimeType)) {
    throw new Error("Unsupported Telegram attachment type");
  }
  if (file.bytes.byteLength > 20 * 1024 * 1024) {
    throw new Error("Telegram attachment is too large");
  }
  const storagePath = `${apartmentId}/telegram/inbox/${randomUUID()}-${safeFilename(file.filename)}`;
  const { error } = await admin.storage.from("asset-media").upload(storagePath, file.bytes, {
    contentType: file.mimeType,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return {
    dataUrl: `data:${file.mimeType};base64,${Buffer.from(file.bytes).toString("base64")}`,
    filename: file.filename,
    mimeType: file.mimeType,
    storagePath,
  } satisfies TelegramAssistantAttachment;
}

function displayName(user: TelegramUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ");
}

async function connectAccount(admin: NonNullable<ReturnType<typeof createAdminClient>>, code: string, user: TelegramUser, chatId: number) {
  const now = new Date().toISOString();
  const { data: pairing, error } = await admin.from("telegram_pairing_codes").select("id,owner_user_id,owner_email,default_apartment_id").eq("code_hash", createHash("sha256").update(code).digest("hex")).is("used_at", null).gt("expires_at", now).maybeSingle();
  if (error || !pairing) return false;
  const { data: claimedPairing, error: claimError } = await admin
    .from("telegram_pairing_codes")
    .update({ used_at: now })
    .eq("id", pairing.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimedPairing) return false;

  const { data: previousAccount, error: previousError } = await admin
    .from("telegram_accounts")
    .select("telegram_user_id")
    .eq("owner_user_id", pairing.owner_user_id)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  if (previousAccount && String(previousAccount.telegram_user_id) !== String(user.id)) {
    const { error: deleteError } = await admin
      .from("telegram_accounts")
      .delete()
      .eq("telegram_user_id", previousAccount.telegram_user_id);
    if (deleteError) throw new Error(deleteError.message);
  }

  const { error: accountError } = await admin.from("telegram_accounts").upsert({
    telegram_user_id: user.id,
    owner_user_id: pairing.owner_user_id,
    owner_email: pairing.owner_email,
    default_apartment_id: pairing.default_apartment_id,
    chat_id: chatId,
    display_name: displayName(user),
    username: user.username ?? null,
    active: true,
    updated_at: now,
  }, { onConflict: "telegram_user_id" });
  if (accountError) throw new Error(accountError.message);
  return true;
}

async function getTelegramAccount(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  telegramUserId: number,
) {
  const { data, error } = await admin
    .from("telegram_accounts")
    .select("telegram_user_id,owner_user_id,owner_email,default_apartment_id,display_name")
    .eq("telegram_user_id", telegramUserId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as TelegramOwnerAccount | null;
}

async function sendAssistantReply(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  telegramUserId: number,
  chatId: number,
  text: string,
) {
  const { data, error } = await admin
    .from("telegram_conversations")
    .select("active_apartment_id,pending_action")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const pendingAction = data?.pending_action as Record<string, unknown> | null;
  const hasReadyDraft = Boolean(pendingAction?.type && String(pendingAction.type).startsWith("create_"));
  let reply = hasReadyDraft ? cleanTelegramDraftText(text) : text;
  if (pendingAction?.type === "create_utility_bill") {
    const apartmentId = typeof pendingAction.apartmentId === "string" ? pendingAction.apartmentId : "";
    let currency = "RUB";
    let timezone = "Europe/Moscow";
    if (apartmentId) {
      const { data: apartment } = await admin.from("apartments").select("currency,timezone").eq("id", apartmentId).maybeSingle();
      if (typeof apartment?.currency === "string" && apartment.currency) currency = apartment.currency;
      if (typeof apartment?.timezone === "string" && apartment.timezone) timezone = apartment.timezone;
    }
    reply = utilityDraftReply(pendingAction, currency, timezone) ?? reply;
  }
  await sendTelegramMessage(chatId, reply, {
    inlineKeyboard: pendingAction?.type === "create_utility_bill"
      ? (() => {
          const payload = pendingAction.payload as Record<string, unknown> | undefined;
          const items = Array.isArray(payload?.items) ? payload.items : payload ? [payload] : [];
          const hasInsurance = items.some((item) => item && typeof item === "object" && Number((item as Record<string, unknown>).optionalChargeAmount ?? 0) > 0);
          return hasInsurance ? utilityInsuranceKeyboard : utilityDraftKeyboard;
        })()
      : hasReadyDraft ? draftKeyboard : undefined,
  });
  const { data: account } = await admin
    .from("telegram_accounts")
    .select("owner_user_id,default_apartment_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (account?.owner_user_id) {
    await recordAssistantMessage(admin, {
      ownerUserId: account.owner_user_id,
      apartmentId: data?.active_apartment_id ?? account.default_apartment_id,
      role: "assistant",
      channel: "telegram",
      content: reply,
    });
  }
}

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const callback = update?.callback_query;
  const message = update?.message;
  const user = message?.from ?? callback?.from;
  const chat = message?.chat ?? callback?.message?.chat;
  if (!update || !user || !chat) return NextResponse.json({ ok: true });
  if (chat.type !== "private") return NextResponse.json({ ok: true, ignored: "group-mode-not-enabled" });

  const { error: updateError } = await admin.from("telegram_updates").insert({ update_id: update.update_id, telegram_user_id: user.id });
  if (updateError) {
    if (updateError.code !== "23505") return NextResponse.json({ error: updateError.message }, { status: 500 });
    const { data: existing } = await admin.from("telegram_updates").select("status").eq("update_id", update.update_id).maybeSingle();
    if (existing?.status !== "failed") return NextResponse.json({ ok: true, duplicate: true });
    const { error: retryError } = await admin.from("telegram_updates").update({ status: "processing", error: null, processed_at: null }).eq("update_id", update.update_id);
    if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
  }

  if (message?.media_group_id && !message.caption?.trim()) {
    await admin.from("telegram_updates").update({ status: "processed", processed_at: new Date().toISOString() }).eq("update_id", update.update_id);
    return NextResponse.json({ ok: true, ignored: "media-group-companion" });
  }

  try {
    if (callback) {
      await answerTelegramCallbackQuery(callback.id);
      if (callback.message) {
        await clearTelegramInlineKeyboard(callback.message.chat.id, callback.message.message_id);
      }
      const account = await getTelegramAccount(admin, user.id);
      if (!account) {
        await sendTelegramMessage(chat.id, "Сначала подключите FixPlan по персональной ссылке из веб-интерфейса.");
      } else if (callback.data === "fixplan:pending:edit") {
        await sendTelegramMessage(chat.id, "Напишите одним сообщением, что изменить в черновике.", {
          inlineKeyboard: editDraftKeyboard,
        });
      } else if (callback.data === "fixplan:pending:confirm" || callback.data === "fixplan:pending:cancel") {
        const active = await getActiveTelegramApartment(admin, account);
        if ("error" in active) throw new Error(active.error);
        const callbackText = callback.data.endsWith(":confirm") ? "Создать" : "Удалить черновик";
        await recordAssistantMessage(admin, { ownerUserId: account.owner_user_id, apartmentId: active.apartment.id, role: "user", channel: "telegram", content: callbackText });
        const answer = await runTelegramAssistant(
          admin,
          account,
          callback.data.endsWith(":confirm") ? "создавай" : "отмена",
          new URL(request.url).origin,
        );
        await sendAssistantReply(admin, user.id, chat.id, answer);
      } else if (callback.data === "fixplan:utility:insurance:keep" || callback.data === "fixplan:utility:insurance:exclude") {
        const active = await getActiveTelegramApartment(admin, account);
        if ("error" in active) throw new Error(active.error);
        const callbackText = callback.data.endsWith(":exclude") ? "Исключить страховку" : "Оставить страховку";
        await recordAssistantMessage(admin, { ownerUserId: account.owner_user_id, apartmentId: active.apartment.id, role: "user", channel: "telegram", content: callbackText });
        const answer = await runTelegramAssistant(
          admin,
          account,
          callback.data.endsWith(":exclude") ? "страховку не включаем" : "страховку включаем",
          new URL(request.url).origin,
        );
        await sendAssistantReply(admin, user.id, chat.id, answer);
      } else {
        await sendTelegramMessage(chat.id, "Эта кнопка уже неактуальна.");
      }
    } else if (message) {
      const text = message.text?.trim() ?? "";
      const startCode = text.match(/^\/start(?:\s+(.+))?$/i)?.[1];
      if (startCode) {
        const connected = await connectAccount(admin, startCode, user, message.chat.id);
        await sendTelegramMessage(message.chat.id, connected ? "FixPlan подключён. Можно управлять квартирой текстом и голосом, а также пересылать сюда счета и квитанции." : "Ссылка подключения недействительна или уже использована.");
      } else {
        const account = await getTelegramAccount(admin, user.id);
        if (!account) {
          await sendTelegramMessage(message.chat.id, "Сначала подключите FixPlan по персональной ссылке из веб-интерфейса.");
        } else if (message.voice || message.photo?.length || message.document || text) {
          const userMessage = message.voice ? await transcribeTelegramVoice(message.voice.file_id) : text;
          const active = await getActiveTelegramApartment(admin, account);
          if ("error" in active) throw new Error(active.error);
          const attachment = await uploadTelegramAttachment(admin, active.apartment.id, message);
          await recordAssistantMessage(admin, {
            ownerUserId: account.owner_user_id,
            apartmentId: active.apartment.id,
            role: "user",
            channel: "telegram",
            content: message.caption?.trim() || userMessage || attachment?.filename || "Вложение",
            attachments: attachment ? [{ filename: attachment.filename, mimeType: attachment.mimeType, storagePath: attachment.storagePath }] : [],
          });
          const answer = await runTelegramAssistant(
            admin,
            account,
            message.caption?.trim() || userMessage,
            new URL(request.url).origin,
            attachment,
          );
          await sendAssistantReply(admin, user.id, message.chat.id, answer);
        }
      }
    }
    await admin.from("telegram_updates").update({ status: "processed", processed_at: new Date().toISOString() }).eq("update_id", update.update_id);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Telegram error";
    await admin.from("telegram_updates").update({ status: "failed", error: detail.slice(0, 1000), processed_at: new Date().toISOString() }).eq("update_id", update.update_id);
    try {
      await sendTelegramMessage(chat.id, "Не удалось обработать запрос. Попробуйте ещё раз чуть позже.");
    } catch (sendError) {
      console.error("Unable to send Telegram error message", sendError);
    }
  }
  return NextResponse.json({ ok: true });
}
