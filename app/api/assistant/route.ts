import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApartmentAccess } from "../assets/access";
import { recordAssistantMessage } from "@/lib/server/assistant-messages";
import { runTelegramAssistant, type TelegramAssistantAttachment } from "@/lib/server/telegram-assistant";
import type { TelegramOwnerAccount } from "@/lib/server/telegram-context";

const supportedAttachmentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
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
  const file = form.get("file");
  if (!text && !(file instanceof File && file.size)) {
    return NextResponse.json({ error: "Напишите сообщение или прикрепите файл." }, { status: 400 });
  }

  const account = await connectedAccount(access.admin, access.userId);
  if (!account) {
    return NextResponse.json({ error: "Сначала подключите Telegram в настройках, чтобы веб и бот продолжали один диалог." }, { status: 409 });
  }

  let attachment: TelegramAssistantAttachment | undefined;
  if (file instanceof File && file.size) {
    if (!supportedAttachmentTypes.has(file.type)) {
      return NextResponse.json({ error: "Поддерживаются изображения и PDF." }, { status: 415 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Файл должен быть не больше 20 МБ." }, { status: 413 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const storagePath = `${access.apartmentId}/web/inbox/${randomUUID()}-${safeFilename(file.name)}`;
    const { error: uploadError } = await access.admin.storage.from("asset-media").upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    attachment = {
      dataUrl: `data:${file.type};base64,${bytes.toString("base64")}`,
      filename: file.name,
      mimeType: file.type,
      storagePath,
    };
  }

  await recordAssistantMessage(access.admin, {
    ownerUserId: access.userId,
    apartmentId: access.apartmentId,
    role: "user",
    channel: "web",
    content: text || attachment?.filename || "Вложение",
    attachments: attachment ? [{ filename: attachment.filename, mimeType: attachment.mimeType, storagePath: attachment.storagePath }] : [],
  });

  try {
    const answer = await runTelegramAssistant(access.admin, account, text, new URL(request.url).origin, attachment);
    await recordAssistantMessage(access.admin, {
      ownerUserId: access.userId,
      apartmentId: access.apartmentId,
      role: "assistant",
      channel: "web",
      content: answer,
    });
    const { data: conversation } = await access.admin
      .from("telegram_conversations")
      .select("pending_action")
      .eq("telegram_user_id", account.telegram_user_id)
      .maybeSingle();
    return NextResponse.json({ message: answer, pendingAction: conversation?.pending_action ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось обработать запрос." }, { status: 500 });
  }
}
