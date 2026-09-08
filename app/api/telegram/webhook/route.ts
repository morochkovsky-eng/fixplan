import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAssistantMessage } from "@/lib/server/assistant-messages";
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

function currencyLabel(value: unknown, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
  } catch {
    const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : "₽";
    return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  }
}

function utilityDraftReply(pendingAction: Record<string, unknown>, currency: string, timezone: string) {
  if (pendingAction.type !== "create_utility_bill") return null;
  const payload = pendingAction.payload;
  if (!payload || typeof payload !== "object") return null;
  const bill = payload as Record<string, unknown>;
  const service = typeof bill.service === "string" ? bill.service.trim() : "";
  const period = typeof bill.period === "string" ? bill.period.trim() : "";
  const items = (Array.isArray(bill.items) ? bill.items : [bill])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  const latest = items.at(-1) ?? bill;
  const latestService = typeof latest.service === "string" ? latest.service.trim() : service;
  const amount = Number(latest.amount);
  if (!service || !period || !Number.isFinite(amount) || amount <= 0) return null;
  const tenantAmount = Number(latest.tenantAmount ?? amount);
  const optionalChargeLabel = typeof latest.optionalChargeLabel === "string" ? latest.optionalChargeLabel.trim() : "";
  const optionalChargeAmount = Number(latest.optionalChargeAmount ?? 0);
  const optionalChargeIncluded = Boolean(latest.optionalChargeIncluded && optionalChargeAmount > 0);
  const dueDate = typeof latest.dueDate === "string" ? latest.dueDate.trim() : "";
  const existingItems = Array.isArray(bill.existingItems)
    ? bill.existingItems.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : [];
  const statementItems = [
    ...existingItems.map((entry) => ({ service: entry.service, tenantAmount: entry.tenant_amount })),
    ...items.map((entry) => ({ service: entry.service, tenantAmount: entry.tenantAmount })),
  ];
  const tenantTotal = statementItems.reduce((sum, entry) => sum + Number(entry.tenantAmount ?? 0), 0);
  const hasPreviousItems = statementItems.length > 1;
  const createdAt = typeof bill.draftCreatedAt === "string" ? new Date(bill.draftCreatedAt) : null;
  const createdLabel = createdAt && !Number.isNaN(createdAt.valueOf())
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: timezone }).format(createdAt)
    : "сегодня";
  const extracted = [
    `Что удалось извлечь из вложения (${latestService}, ${period.toLocaleLowerCase("ru-RU")}):`,
    `• Период начисления: за ${period.toLocaleLowerCase("ru-RU")}`,
    `• Начислено за месяц: ${currencyLabel(amount, currency)}`,
    ...(optionalChargeLabel && optionalChargeAmount > 0
      ? [`• ${optionalChargeLabel}: ${currencyLabel(optionalChargeAmount, currency)} (${optionalChargeIncluded ? "включено" : "исключено"})`]
      : []),
    ...(dueDate ? [`• Срок оплаты: ${dueDate}`] : []),
    `Жилец должен: ${currencyLabel(tenantAmount, currency)}`,
    "",
  ];
  if (hasPreviousItems) {
    const continuationLabel = existingItems.length
      ? `Подготовил дополнение к счёту за ${period.toLocaleLowerCase("ru-RU")}.`
      : `Дополнил черновик от ${createdLabel}.`;
    extracted.push(
      continuationLabel,
      `• Период: за ${period.toLocaleLowerCase("ru-RU")}`,
      ...statementItems.map((entry) => `• ${String(entry.service ?? "Услуга")}: ${currencyLabel(entry.tenantAmount, currency)}`),
      `Жилец должен всего: ${currencyLabel(tenantTotal, currency)}`,
      "",
    );
  } else {
    extracted.push("Черновик уже создан.", "");
  }
  extracted.push(
    "Чтобы добавить другие ресурсы, пришлите дополнительные квитанции.",
  );
  return extracted.join("\n");
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
