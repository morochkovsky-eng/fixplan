const telegramApi = "https://api.telegram.org";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: TelegramUser;
    text?: string;
    caption?: string;
    voice?: { file_id: string; duration: number };
    photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
    document?: {
      file_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: {
      message_id: number;
      chat: { id: number; type: string };
    };
    data?: string;
  };
};

export type TelegramFile = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

export type TelegramInlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export function cleanTelegramText(text: string) {
  return text
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/\bmaster_needed\b/gi, "нужен мастер")
    .replace(/\bin_progress\b/gi, "в работе")
    .replace(/\battention\b/gi, "требует внимания")
    .replace(/\bok\b/gi, "исправно")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options: { inlineKeyboard?: TelegramInlineButton[][] } = {},
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(`${telegramApi}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: cleanTelegramText(text),
      link_preview_options: { is_disabled: true },
      reply_markup: options.inlineKeyboard
        ? { inline_keyboard: options.inlineKeyboard }
        : undefined,
    }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed with ${response.status}`);
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`${telegramApi}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
  if (!response.ok) throw new Error(`Telegram answerCallbackQuery failed with ${response.status}`);
}

export async function clearTelegramInlineKeyboard(chatId: number | string, messageId: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`${telegramApi}/bot${token}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
  });
  if (!response.ok) throw new Error(`Telegram editMessageReplyMarkup failed with ${response.status}`);
}

export async function downloadTelegramFile(
  fileId: string,
  options: { filename?: string; mimeType?: string } = {},
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const metadataResponse = await fetch(`${telegramApi}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!metadataResponse.ok) throw new Error(`Telegram getFile failed with ${metadataResponse.status}`);
  const metadata = (await metadataResponse.json()) as { ok: boolean; result?: { file_path?: string; file_size?: number } };
  const path = metadata.result?.file_path;
  if (!metadata.ok || !path) throw new Error("Telegram file is unavailable");
  if ((metadata.result?.file_size ?? 0) > 20 * 1024 * 1024) throw new Error("Telegram file is too large");

  const fileResponse = await fetch(`${telegramApi}/file/bot${token}/${path}`);
  if (!fileResponse.ok) throw new Error(`Telegram file download failed with ${fileResponse.status}`);
  const blob = await fileResponse.blob();
  const fallbackName = path.split("/").at(-1) ?? "telegram-file";
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    filename: options.filename?.trim() || fallbackName,
    mimeType: options.mimeType?.trim() || blob.type || "application/octet-stream",
  } satisfies TelegramFile;
}

export async function transcribeTelegramVoice(fileId: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const audio = await downloadTelegramFile(fileId, {
    filename: "telegram-voice.ogg",
    mimeType: "audio/ogg",
  });
  const form = new FormData();
  form.set("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe");
  form.set("language", "ru");
  form.set("file", new File([audio.bytes], audio.filename, { type: audio.mimeType }));
  const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!transcriptionResponse.ok) throw new Error(`OpenAI transcription failed with ${transcriptionResponse.status}`);
  const transcription = (await transcriptionResponse.json()) as { text?: string };
  const text = transcription.text?.trim();
  if (!text) throw new Error("Voice transcription is empty");
  return text;
}
