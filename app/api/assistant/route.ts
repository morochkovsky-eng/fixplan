import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";
import { recordAssistantMessage } from "@/lib/server/assistant-messages";
import { utilityDraftReply } from "@/lib/server/assistant-replies";
import { runTelegramAssistant, type TelegramAssistantAttachment } from "@/lib/server/telegram-assistant";
import type { TelegramOwnerAccount } from "@/lib/server/telegram-context";
import { cleanTelegramDraftText, cleanTelegramText, transcribeAudioFile } from "@/lib/server/telegram";

const supportedAttachmentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
]);

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "attachment";
}

async function connectedAccount(
  admin: NonNullable<Awaited<ReturnType<typeof requireApartmentAccess>>["admin"]>,
  userId: string,
) {
  const { data, error } = await admin
    .from("telegram_accounts")
    .select("telegram_user_id,owner_user_id,owner_email,default_apartment_id,display_name")
    .eq("owner_user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as TelegramOwnerAccount | null;
}

export async function GET() {
  const access = await requireApartmentAccess();
  if (!access.admin) return NextResponse.json({ error: access.error }, { status: access.status });
  const account = await connectedAccount(access.admin, access.userId);
  const [messagesResult, conversationResult] = await Promise.all([
    access.admin
      .from("assistant_messages")
      .select("id,role,channel,content,attachments,created_at")
      .eq("owner_user_id", access.userId)
      .eq("apartment_id", access.apartmentId)
      .order("created_at", { ascending: false })
      .limit(60),
    account
      ? access.admin.from("telegram_conversations").select("pending_action").eq("telegram_user_id", account.telegram_user_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data, error } = messagesResult;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (conversationResult.error) return NextResponse.json({ error: conversationResult.error.message }, { status: 500 });
  return NextResponse.json({
    messages: (data ?? []).reverse(),
    pendingAction: conversationResult.data?.pending_action ?? null,
  });
}

export async function POST(request: Request) {
  const access = await requireApartmentAccess();
  if (!access.admin) return NextResponse.json({ error: access.error }, { status: access.status });

  const form = await request.formData();
  const text = String(form.get("text") ?? "").trim();
  const webContext = String(form.get("context") ?? "").trim().slice(0, 300);
  const file = form.get("file");
  if (!text && !(file instanceof File && file.size)) {
    return NextResponse.json({ error: "Напишите сообщение или прикрепите файл." }, { status: 400 });
  }

  const account = await connectedAccount(access.admin, access.userId);
  if (!account) {
    return NextResponse.json({ error: "Сначала подключите Telegram в настройках, чтобы веб и бот продолжали один диалог." }, { status: 409 });
  }

  let assistantText = text;
  let attachment: TelegramAssistantAttachment | undefined;
  let storedAttachment: { filename: string; mimeType: string; storagePath: string } | undefined;
  if (file instanceof File && file.size) {
    const mimeType = file.type.split(";", 1)[0];
    if (!supportedAttachmentTypes.has(mimeType)) {
      return NextResponse.json({ error: "Поддерживаются изображения, PDF и голосовые сообщения." }, { status: 415 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Файл должен быть не больше 20 МБ." }, { status: 413 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const storagePath = `${access.apartmentId}/web/inbox/${randomUUID()}-${safeFilename(file.name)}`;
    const { error: uploadError } = await access.admin.storage.from("asset-media").upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    storedAttachment = { filename: file.name, mimeType, storagePath };
    if (mimeType.startsWith("audio/")) {
      try {
        const transcript = await transcribeAudioFile(bytes, file.name || "web-voice.webm", mimeType);
        assistantText = [text, transcript].filter(Boolean).join("\n");
      } catch {
        await access.admin.storage.from("asset-media").remove([storagePath]);
        return NextResponse.json({ error: "Не удалось распознать голосовое сообщение." }, { status: 502 });
      }
    } else {
      attachment = {
        dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
        filename: file.name,
        mimeType,
        storagePath,
      };
    }
  }

  await recordAssistantMessage(access.admin, {
    ownerUserId: access.userId,
    apartmentId: access.apartmentId,
    role: "user",
    channel: "web",
    content: assistantText || storedAttachment?.filename || "Вложение",
    attachments: storedAttachment ? [storedAttachment] : [],
  });

  try {
    const isPendingCommand = /^(?:(?:да|ок),?\s*)?(?:создавай|создать|подтверждаю)$|^(?:отмена|отменить|удалить черновик)$/iu.test(assistantText);
    const contextualText = webContext && !isPendingCommand
      ? `${assistantText}\n\nКонтекст открытого экрана веб-интерфейса: ${webContext}`
      : assistantText;
    const answer = await runTelegramAssistant(access.admin, account, contextualText, new URL(request.url).origin, attachment);
    const [conversationResult, apartmentResult] = await Promise.all([
      access.admin.from("telegram_conversations").select("pending_action").eq("telegram_user_id", account.telegram_user_id).maybeSingle(),
      access.admin.from("apartments").select("currency,timezone").eq("id", access.apartmentId).maybeSingle(),
    ]);
    if (conversationResult.error) throw new Error(conversationResult.error.message);
    if (apartmentResult.error) throw new Error(apartmentResult.error.message);
    const pending = conversationResult.data?.pending_action as Record<string, unknown> | null;
    const conciseAnswer = pending?.type
      ? utilityDraftReply(
          pending,
          apartmentResult.data?.currency ?? "RUB",
          apartmentResult.data?.timezone ?? "Europe/Moscow",
        ) ?? cleanTelegramDraftText(answer)
      : answer;
    await recordAssistantMessage(access.admin, {
      ownerUserId: access.userId,
      apartmentId: access.apartmentId,
      role: "assistant",
      channel: "web",
      content: conciseAnswer,
    });
    return NextResponse.json({ message: conciseAnswer, pendingAction: pending });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось обработать запрос." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireApartmentAccess();
  if (!access.admin) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const body = await request.json() as { action?: unknown };
    if (body.action !== "confirm" && body.action !== "cancel") {
      return NextResponse.json({ error: "Неизвестное действие." }, { status: 400 });
    }

    const account = await connectedAccount(access.admin, access.userId);
    if (!account) {
      return NextResponse.json({ error: "Сначала подключите Telegram в настройках, чтобы веб и бот продолжали один диалог." }, { status: 409 });
    }

    const { data: conversation, error: conversationError } = await access.admin
      .from("telegram_conversations")
      .select("pending_action")
      .eq("telegram_user_id", account.telegram_user_id)
      .maybeSingle();
    if (conversationError) throw new Error(conversationError.message);
    const pending = conversation?.pending_action as Record<string, unknown> | null;
    if (!pending || typeof pending.type !== "string" || !pending.type.startsWith("create_")) {
      return NextResponse.json({ error: "Черновик уже неактуален. Обновите диалог и попробуйте снова." }, { status: 409 });
    }

    const answer = await runTelegramAssistant(
      access.admin,
      account,
      body.action === "confirm" ? "создавай" : "отмена",
      new URL(request.url).origin,
    );
    const conciseAnswer = cleanTelegramText(answer);
    await recordAssistantMessage(access.admin, {
      ownerUserId: access.userId,
      apartmentId: access.apartmentId,
      role: "assistant",
      channel: "web",
      content: conciseAnswer,
    });

    const { data: updatedConversation, error: updatedConversationError } = await access.admin
      .from("telegram_conversations")
      .select("pending_action")
      .eq("telegram_user_id", account.telegram_user_id)
      .maybeSingle();
    if (updatedConversationError) throw new Error(updatedConversationError.message);
    return NextResponse.json({
      message: conciseAnswer,
      pendingAction: updatedConversation?.pending_action ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось выполнить действие." }, { status: 500 });
  }
}
