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
    media_group_id?: string;
    chat: { id: number; type: string; title?: string };
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
      chat: { id: number; type: string; title?: string };
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

const processingCustomEmojiId = "5269577632676092329";
const processingFallbackEmoji = "🫥";

function processingPayload(chatId: number | string, text: string) {
  return {
    chat_id: chatId,
    text: `${processingFallbackEmoji} ${text}`,
    entities: [
      {
        type: "custom_emoji",
        offset: 0,
        length: 2,
        custom_emoji_id: processingCustomEmojiId,
      },
    ],
    disable_notification: true,
  };
}

async function callTelegram<T>(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  let response: Response;
  try {
    response = await fetch(`${telegramApi}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    throw new TelegramDeliveryUncertainError();
  }
  const payload = (await response.json().catch(() => null)) as
    | { ok: boolean; result?: T; error_code?: number }
    | null;
  if (!response.ok || !payload?.ok || payload.result === undefined) {
    throw new TelegramSendError(payload?.error_code ?? response.status);
  }
  return payload.result;
}

export function sendTelegramProcessingMessage(
  chatId: number | string,
  text: string,
) {
  return callTelegram<{ message_id: number }>(
    "sendMessage",
    processingPayload(chatId, text),
  );
}

export function updateTelegramProcessingMessage(
  chatId: number | string,
  messageId: number,
  text: string,
) {
  return callTelegram<{ message_id: number }>("editMessageText", {
    ...processingPayload(chatId, text),
    message_id: messageId,
  });
}

export function deleteTelegramMessage(
  chatId: number | string,
  messageId: number,
) {
  return callTelegram<boolean>("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

export function editTelegramMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
) {
  return callTelegram<{ message_id: number }>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    link_preview_options: { is_disabled: true },
  });
}

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
    .replace(/\bowner\b/gi, "владелец")
    .replace(/\btenant\b/gi, "жилец")
    .replace(/\bsplit\b/gi, "разделено")
    .replace(/(?:\bRUBS?|РУБ(?:Л(?:ЕЙ|Я)?)?)\.?(?=\s|$|[),;:!?])/giu, "₽")
    .replace(/\bEUR(?:OS?)?\.?(?=\s|$|[),;:!?])/giu, "€")
    .replace(/\b(?:USD|DOLLARS?)\.?(?=\s|$|[),;:!?])/giu, "$")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanTelegramDraftText(text: string) {
  const confirmationPrompt = /^(?:если\s+вс[её].*|нужно\s+(?:ваше\s+)?подтверждение.*|(?:пожалуйста,?\s*)?подтвердите.*|(?:напишите|скажите|ответьте).*?(?:созда|подтверд).*)$/i;
  const cleaned = text
    .split("\n")
    .filter((line) => !confirmationPrompt.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || "Проверьте данные и выберите действие ниже.";
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options: {
    inlineKeyboard?: TelegramInlineButton[][];
    disableNotification?: boolean;
  } = {},
) {
  return callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: cleanTelegramText(text),
    link_preview_options: { is_disabled: true },
    reply_markup: options.inlineKeyboard
      ? { inline_keyboard: options.inlineKeyboard }
      : undefined,
    disable_notification: options.disableNotification,
  });
}

export function splitTelegramText(text: string, limit = 3800) {
  const cleaned = cleanTelegramText(text);
  if (cleaned.length <= limit) return [cleaned];
  const chunks: string[] = [];
  let rest = cleaned;
  while (rest.length > limit) {
    const candidate = rest.slice(0, limit);
    const splitAt = Math.max(candidate.lastIndexOf("\n\n"), candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
    const boundary = splitAt > limit / 2 ? splitAt : limit;
    chunks.push(rest.slice(0, boundary).trim());
    rest = rest.slice(boundary).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export async function sendTelegramMessageChunks(
  chatId: number | string,
  text: string,
  options: { inlineKeyboard?: TelegramInlineButton[][]; disableNotification?: boolean } = {},
) {
  const chunks = splitTelegramText(text);
  let sent: { message_id: number } | undefined;
  for (const [index, chunk] of chunks.entries()) {
    sent = await sendTelegramMessage(chatId, chunk, {
      disableNotification: options.disableNotification,
      inlineKeyboard: index === chunks.length - 1 ? options.inlineKeyboard : undefined,
    });
  }
  if (!sent) throw new Error("Telegram reply is empty");
  return sent;
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
  const audio = await downloadTelegramFile(fileId, {
    filename: "telegram-voice.ogg",
    mimeType: "audio/ogg",
  });
  return transcribeAudioFile(audio.bytes, audio.filename, audio.mimeType);
}

export async function transcribeAudioFile(bytes: Uint8Array, filename: string, mimeType: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const form = new FormData();
  form.set("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe");
  form.set("language", "ru");
  form.set("file", new File([Uint8Array.from(bytes).buffer], filename, { type: mimeType }));
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

export class TelegramSendError extends Error {
  constructor(public code: number) { super(`Telegram rejected message: ${code}`); }
}

export class TelegramDeliveryUncertainError extends Error {
  constructor() { super("Telegram delivery is uncertain"); }
}

export async function getTelegramChat(chatId: number | string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured");
  const response = await fetch(`${telegramApi}/bot${token}/getChat`, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({chat_id:chatId})});
  const payload = await response.json() as {ok:boolean; result?:{id:number; type:string; title?:string}};
  if (!response.ok || !payload.ok || !payload.result) throw new Error("Группа недоступна. Проверьте, что бот добавлен в группу.");
  return payload.result;
}
