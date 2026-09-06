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
    voice?: { file_id: string; duration: number };
  };
};

export async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(`${telegramApi}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed with ${response.status}`);
}

export async function transcribeTelegramVoice(fileId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const metadataResponse = await fetch(`${telegramApi}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!metadataResponse.ok) throw new Error(`Telegram getFile failed with ${metadataResponse.status}`);
  const metadata = (await metadataResponse.json()) as { ok: boolean; result?: { file_path?: string; file_size?: number } };
  const path = metadata.result?.file_path;
  if (!metadata.ok || !path) throw new Error("Telegram voice file is unavailable");
  if ((metadata.result?.file_size ?? 0) > 20 * 1024 * 1024) throw new Error("Telegram voice file is too large");

  const audioResponse = await fetch(`${telegramApi}/file/bot${token}/${path}`);
  if (!audioResponse.ok) throw new Error(`Telegram voice download failed with ${audioResponse.status}`);
  const audio = await audioResponse.blob();
  const form = new FormData();
  form.set("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe");
  form.set("language", "ru");
  form.set("file", new File([audio], "telegram-voice.ogg", { type: audio.type || "audio/ogg" }));
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
