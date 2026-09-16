import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAssistantMessage } from "@/lib/server/assistant-messages";
import { handleStatementDecision } from "@/lib/server/telegram-statements";
import { runTelegramAssistant, type TelegramAssistantAttachment } from "@/lib/server/telegram-assistant";
import { getActiveTelegramApartment, type TelegramOwnerAccount } from "@/lib/server/telegram-context";
import {
  answerTelegramCallbackQuery,
  cleanTelegramDraftText,
  clearTelegramInlineKeyboard,
  downloadTelegramFile,
  sendTelegramMessage,
  getTelegramChat,
  transcribeTelegramVoice,
  type TelegramInlineButton,
  type TelegramUpdate,
  type TelegramUser,
} from "@/lib/server/telegram";

const supportedAttachmentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);
export const maxDuration = 300;
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
  const reply = hasReadyDraft ? cleanTelegramDraftText(text) : text;
  if (pendingAction?.type === "send_utility_statement") {
    const {data:delivery,error:deliveryError}=await admin.from("telegram_statement_deliveries").select("id,body,group_title,chat_id,status").eq("id",pendingAction.deliveryId).eq("telegram_user_id",telegramUserId).maybeSingle();
    if(deliveryError)throw new Error(deliveryError.message);
    if(delivery?.status === "prepared") {
      await sendTelegramMessage(chatId,delivery.body);
      await sendTelegramMessage(chatId,delivery.chat_id ? `Отправить этот счёт в группу «${delivery.group_title}»? Можно ответить «да, отправляем» или оставить текст у себя.` : "Счёт готов для копирования. Чтобы отправлять его через бота, подключите группу в настройках квартиры → Telegram → Чат с арендатором.", {inlineKeyboard:[
        ...(delivery.chat_id ? [[{text:"Отправить в группу",callback_data:`statement:send:${delivery.id}`}]] : []),
        [{text:"Текст для копирования",callback_data:`statement:copy:${delivery.id}`},{text:"Оставить у меня",callback_data:`statement:cancel:${delivery.id}`}],
      ]});
      const {data:owner}=await admin.from("telegram_accounts").select("owner_user_id").eq("telegram_user_id",telegramUserId).single();
      if(owner)await recordAssistantMessage(admin,{ownerUserId:owner.owner_user_id,apartmentId:String(pendingAction.apartmentId),role:"assistant",channel:"telegram",content:delivery.body});
      return;
    }
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
  if (chat.type !== "private") {
    const code=message?.text?.trim().match(/^\/start(?:@[a-z0-9_]+)?\s+(group_[A-Za-z0-9_-]+)$/i)?.[1];
    if(!code || !["group","supergroup"].includes(chat.type))return NextResponse.json({ok:true,ignored:"group-conversation"});
    const account=await getTelegramAccount(admin,user.id);
    if(!account)return NextResponse.json({ok:true,ignored:"unpaired-owner"});
    try {
      const info=await getTelegramChat(chat.id);
      const {data:connected,error:connectError}=await admin.rpc("connect_telegram_apartment_group",{p_hash:createHash("sha256").update(code).digest("hex"),p_user:user.id,p_chat:chat.id,p_title:info.title??"Чат квартиры"});
      if(connectError)throw new Error(connectError.message);
      await sendTelegramMessage(user.id,connected ? `Группа «${info.title??"Чат квартиры"}» подключена. Сформируйте счёт здесь, в личном чате. Перед отправкой покажу сумму и спрошу подтверждение.` : "Ссылка группы устарела или уже использована. Создайте новую в настройках квартиры.");
    } catch {
      await sendTelegramMessage(user.id,"Не удалось подключить группу. Проверьте, что бот добавлен, а группа не подключена к другой квартире. Создайте новую ссылку в настройках.");
    }
    return NextResponse.json({ok:true});
  }

  const { error: updateError } = await admin.from("telegram_updates").insert({ update_id: update.update_id, telegram_user_id: user.id });
  if (updateError) {
    if (updateError.code !== "23505") return NextResponse.json({ error: updateError.message }, { status: 500 });
    const { data: existing } = await admin.from("telegram_updates").select("status").eq("update_id", update.update_id).maybeSingle();
    if (existing?.status !== "failed") return NextResponse.json({ ok: true, duplicate: true });
    const { error: retryError } = await admin.from("telegram_updates").update({ status: "processing", error: null, processed_at: null }).eq("update_id", update.update_id);
    if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
  }

  const processingToken = randomUUID();
  const { data: processingClaim, error: processingError } = await admin.rpc("claim_telegram_processing", {
    p_user_id: user.id, p_token: processingToken,
  });
  if (processingError || !processingClaim) {
    await admin.from("telegram_updates").update({ status: "failed", error: "processing-busy" }).eq("update_id", update.update_id);
    // Telegram retries this update; do not acknowledge and drop an album attachment.
    return NextResponse.json({ error: "processing-busy" }, { status: 503 });
  }

  try {
    if (callback) {
      await answerTelegramCallbackQuery(callback.id);
      if (callback.message && !callback.data?.startsWith("statement:")) {
        await clearTelegramInlineKeyboard(callback.message.chat.id, callback.message.message_id);
      }
      const account = await getTelegramAccount(admin, user.id);
      if (!account) {
        await sendTelegramMessage(chat.id, "Сначала подключите FixPlan по персональной ссылке из веб-интерфейса.");
      } else if (/^statement:(send|cancel|copy):[0-9a-f-]{36}$/.test(callback.data??"")) {
        const [,decision,id]=callback.data!.split(":");
        const answer=await handleStatementDecision(admin,account,id,decision as "send"|"cancel"|"copy");
        await sendTelegramMessage(chat.id,answer);
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
  } finally {
    await admin.from("telegram_processing_locks").delete().eq("telegram_user_id", user.id).eq("token", processingToken);
  }
  return NextResponse.json({ ok: true });
}
