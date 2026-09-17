import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cleanupTelegramProcessingStatus,
  markTelegramDeliveryUncertain,
  markTelegramProcessingRunning,
  traceTelegramProcessing,
  type TelegramProcessingJob,
} from "@/lib/server/telegram-processing";

export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  await admin.rpc("recover_stale_telegram_updates");
  const { data: uncertainDeliveries } = await admin
    .from("telegram_updates")
    .select("update_id,telegram_user_id,chat_id,processing_message_id")
    .eq("status", "needs_review")
    .eq("delivery_state", "sending")
    .is("status_finalized_at", null)
    .limit(20);
  for (const uncertain of uncertainDeliveries ?? []) {
    await markTelegramDeliveryUncertain(
      admin,
      uncertain as TelegramProcessingJob,
    );
  }
  const { data: pendingCleanup } = await admin
    .from("telegram_updates")
    .select("update_id,telegram_user_id,chat_id,processing_message_id")
    .in("status", ["processed", "failed", "needs_review"])
    .not("response_message_id", "is", null)
    .not("processing_message_id", "is", null)
    .lt("cleanup_attempts", 2)
    .limit(20);
  for (const completed of pendingCleanup ?? []) {
    await cleanupTelegramProcessingStatus(
      admin,
      completed as TelegramProcessingJob,
      true,
    );
  }
  let processed = 0;
  for (let index = 0; index < 10; index += 1) {
    const { data, error } = await admin.rpc("claim_next_telegram_update");
    if (error) throw new Error(error.message);
    const job = (Array.isArray(data) ? data[0] : data) as
      | TelegramProcessingJob
      | undefined;
    if (!job) break;

    const startedAt = Date.now();
    await traceTelegramProcessing(
      admin,
      job.update_id,
      "queue.wait",
      "succeeded",
      job.received_at ? Date.parse(job.received_at) : startedAt,
    );
    await traceTelegramProcessing(
      admin,
      job.update_id,
      "processing",
      "started",
      startedAt,
      { attempt: Number(job.attempts ?? 1) },
    );
    await markTelegramProcessingRunning(admin, job);

    let deliveryPersistenceUncertain = false;
    try {
      const response = await fetch(new URL("/api/telegram/webhook", request.url), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          "x-fixplan-telegram-job": String(job.update_id),
        },
        body: JSON.stringify(job.payload),
        cache: "no-store",
      });
      deliveryPersistenceUncertain = response.status === 503;
      if (!response.ok) throw new Error(`worker_http_${response.status}`);
      await traceTelegramProcessing(
        admin,
        job.update_id,
        "processing",
        "succeeded",
        startedAt,
      );
    } catch (error) {
      const { data: current } = await admin
        .from("telegram_updates")
        .select("status,response_message_id,attempts,delivery_state")
        .eq("update_id", job.update_id)
        .maybeSingle();
      if (current?.status === "running") {
        const uncertain =
          deliveryPersistenceUncertain ||
          current.delivery_state === "sending" ||
          Boolean(current.response_message_id);
        const exhausted = Number(current.attempts ?? 0) >= 3;
        await admin
          .from("telegram_updates")
          .update({
            status: uncertain ? "needs_review" : exhausted ? "failed" : "queued",
            lock_expires_at: null,
            claimed_at: null,
            error: error instanceof Error ? error.message.slice(0, 200) : "worker_failed",
          })
          .eq("update_id", job.update_id)
          .eq("status", "running");
      }
      if (
        deliveryPersistenceUncertain ||
        current?.delivery_state === "sending"
      ) {
        await markTelegramDeliveryUncertain(admin, job);
      }
      await traceTelegramProcessing(
        admin,
        job.update_id,
        "processing",
        "failed",
        startedAt,
        { code: "worker_failed" },
      );
    }
    processed += 1;
  }
  return NextResponse.json({ ok: true, processed });
}

export const GET = run;
export const POST = run;
