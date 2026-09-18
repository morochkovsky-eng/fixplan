import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteTelegramMessage,
  editTelegramMessageText,
  sendTelegramMessage,
  sendTelegramProcessingMessage,
  TelegramSendError,
  updateTelegramProcessingMessage,
  type TelegramUpdate,
} from "@/lib/server/telegram";

export const queuedProcessingText = "Запрос в очереди…";
export const runningProcessingText = "Обрабатываю…";
export const processingStatusMinIntervalMs = 5_000;
export const processingCleanupAttempts = 2;

export function telegramInternalRequestHeaders(
  headers: Record<string, string>,
) {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  return bypassSecret
    ? { ...headers, "x-vercel-protection-bypass": bypassSecret }
    : headers;
}

export function telegramWorkerFailureStatus(input: {
  deliveryPersistenceUncertain: boolean;
  deliveryState?: string | null;
  responseMessageId?: number | null;
  attempts: number;
}) {
  const uncertain =
    input.deliveryPersistenceUncertain ||
    input.deliveryState === "sending" ||
    Boolean(input.responseMessageId);
  if (uncertain) return "delivery_unknown" as const;
  return input.attempts >= 3 ? ("failed" as const) : ("queued" as const);
}

export type TelegramProcessingJob = {
  update_id: number;
  telegram_user_id: number;
  chat_id: number;
  payload: TelegramUpdate;
  processing_message_id: number | null;
  status_last_updated_at: string | null;
  received_at?: string;
  attempts?: number;
  delivery_state?: "pending" | "sending" | "delivered";
};

type TraceStatus = "started" | "succeeded" | "failed" | "skipped";

export function telegramRequestKind(update: TelegramUpdate) {
  const message = update.message;
  if (update.callback_query) return "callback";
  if (message?.voice) return "voice";
  if (message?.photo?.length) return "photo";
  if (message?.document) return "document";
  return "text";
}

export function shouldQueueTelegramUpdate(update: TelegramUpdate) {
  const callback = update.callback_query;
  if (callback) {
    return [
      "fixplan:pending:confirm",
      "fixplan:pending:cancel",
      "fixplan:utility:insurance:keep",
      "fixplan:utility:insurance:exclude",
    ].includes(callback.data ?? "");
  }
  const message = update.message;
  if (!message) return false;
  if (message.media_group_id && !message.caption?.trim()) return false;
  const text = message.text?.trim() ?? "";
  if (/^\/start(?:\s|$)/i.test(text)) return false;
  return Boolean(message.voice || message.photo?.length || message.document || text);
}

export async function traceTelegramProcessing(
  admin: SupabaseClient,
  updateId: number,
  event: string,
  status: TraceStatus,
  startedAt: number,
  details: Record<string, string | number | boolean | null> = {},
) {
  try {
    await admin.from("telegram_request_traces").insert({
      update_id: updateId,
      event,
      status,
      duration_ms: Math.max(0, Date.now() - startedAt),
      details,
    });
  } catch {
    // Tracing is diagnostic and must never change the user-visible outcome.
  }
}

export async function createQueuedProcessingStatus(
  admin: SupabaseClient,
  updateId: number,
  chatId: number,
) {
  const startedAt = Date.now();
  let sent: { message_id: number };
  try {
    sent = await sendTelegramProcessingMessage(chatId, queuedProcessingText);
  } catch (error) {
    if (!(error instanceof TelegramSendError)) throw error;
    sent = await sendTelegramMessage(chatId, queuedProcessingText, {
      disableNotification: true,
    });
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("telegram_updates")
    .update({
      processing_message_id: sent.message_id,
      status_last_updated_at: now,
    })
    .eq("update_id", updateId)
    .is("processing_message_id", null)
    .select("update_id")
    .maybeSingle();

  if (error || !data) {
    try {
      await deleteTelegramMessage(chatId, sent.message_id);
    } catch {
      // A competing retry may already have removed the orphaned status.
    }
    if (error) throw new Error(error.message);
    return null;
  }

  await traceTelegramProcessing(
    admin,
    updateId,
    "status.create",
    "succeeded",
    startedAt,
    { state: "queued" },
  );
  return sent.message_id;
}

export async function markTelegramProcessingRunning(
  admin: SupabaseClient,
  job: TelegramProcessingJob,
) {
  if (!job.processing_message_id) return;
  const startedAt = Date.now();
  try {
    await updateTelegramProcessingMessage(
      job.chat_id,
      job.processing_message_id,
      runningProcessingText,
    );
    await admin
      .from("telegram_updates")
      .update({ status_last_updated_at: new Date().toISOString() })
      .eq("update_id", job.update_id)
      .eq("telegram_user_id", job.telegram_user_id)
      .eq("chat_id", job.chat_id)
      .eq("processing_message_id", job.processing_message_id);
    await traceTelegramProcessing(
      admin,
      job.update_id,
      "status.update",
      "succeeded",
      startedAt,
      { state: "running" },
    );
  } catch {
    await traceTelegramProcessing(
      admin,
      job.update_id,
      "status.update",
      "failed",
      startedAt,
      { state: "running" },
    );
  }
}

export async function cleanupTelegramProcessingStatus(
  admin: SupabaseClient,
  job: Pick<
    TelegramProcessingJob,
    "update_id" | "telegram_user_id" | "chat_id" | "processing_message_id"
  >,
  delivered: boolean,
) {
  if (!delivered || !job.processing_message_id) return false;
  const { data: owned } = await admin
    .from("telegram_updates")
    .select("update_id,cleanup_attempts")
    .eq("update_id", job.update_id)
    .eq("telegram_user_id", job.telegram_user_id)
    .eq("chat_id", job.chat_id)
    .eq("processing_message_id", job.processing_message_id)
    .maybeSingle();
  if (!owned) return false;

  const startedAt = Date.now();
  let removed = false;
  let attempts = 0;
  const previousAttempts = Number(owned.cleanup_attempts ?? 0);
  const remainingAttempts = Math.max(
    0,
    processingCleanupAttempts - previousAttempts,
  );
  for (let attempt = 0; attempt < remainingAttempts; attempt += 1) {
    attempts += 1;
    try {
      await deleteTelegramMessage(job.chat_id, job.processing_message_id);
      removed = true;
      break;
    } catch {
      // Cleanup is best effort and must never replace the delivered result.
    }
  }
  await admin
    .from("telegram_updates")
    .update({
      cleanup_status: removed ? "succeeded" : "failed",
      cleanup_attempts: previousAttempts + attempts,
    })
    .eq("update_id", job.update_id)
    .eq("telegram_user_id", job.telegram_user_id)
    .eq("chat_id", job.chat_id)
    .eq("processing_message_id", job.processing_message_id);
  await traceTelegramProcessing(
    admin,
    job.update_id,
    "status.delete",
    removed ? "succeeded" : "failed",
    startedAt,
    { attempts: previousAttempts + attempts },
  );
  return removed;
}

export async function markTelegramDeliveryUncertain(
  admin: SupabaseClient,
  job: Pick<
    TelegramProcessingJob,
    "update_id" | "telegram_user_id" | "chat_id" | "processing_message_id"
  >,
) {
  if (!job.processing_message_id) return;
  const startedAt = Date.now();
  try {
    await editTelegramMessageText(
      job.chat_id,
      job.processing_message_id,
      "Не удалось подтвердить доставку ответа. Повторите запрос.",
    );
    await admin
      .from("telegram_updates")
      .update({
        status: "delivery_unknown",
        lock_expires_at: null,
        status_finalized_at: new Date().toISOString(),
      })
      .eq("update_id", job.update_id)
      .eq("telegram_user_id", job.telegram_user_id)
      .eq("chat_id", job.chat_id)
      .eq("processing_message_id", job.processing_message_id);
    await traceTelegramProcessing(
      admin,
      job.update_id,
      "status.update",
      "succeeded",
      startedAt,
      { state: "delivery_uncertain" },
    );
  } catch {
    await traceTelegramProcessing(
      admin,
      job.update_id,
      "status.update",
      "failed",
      startedAt,
      { state: "delivery_uncertain" },
    );
  }
}

export async function triggerTelegramWorker(origin: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  await fetch(new URL("/api/telegram/worker", origin), {
    method: "POST",
    headers: telegramInternalRequestHeaders({
      authorization: `Bearer ${secret}`,
    }),
    cache: "no-store",
  });
}
