# Homory Telegram pipeline

**Verified against code and schema:** 2026-09-19, commit `dd848eb330b68dc2169fe717b2b21ce753ef9a23`.

Production currently uses `@fixplanai_bot`. The new `@homory_bot` exists but is not connected.

## Processing flow

```text
Telegram Bot API
  -> POST /api/telegram/webhook
  -> telegram_updates (queued)
  -> immediate processing-status message
  -> POST /api/telegram/worker
  -> atomic per-user FIFO claim
  -> internal authenticated webhook execution
  -> AI/tools and product data
  -> delivery fence
  -> final Telegram response
  -> processing-status cleanup
  -> telegram_request_traces
```

The public webhook validates `x-telegram-bot-api-secret-token`. Worker-to-webhook execution additionally uses `CRON_SECRET`, a stable job ID header, ownership checks for update/user/chat/message, and the Vercel automation bypass header when that optional secret exists.

## Queue semantics

- `telegram_updates.update_id` is the current idempotency key and primary key.
- `claim_next_telegram_update()` claims one eligible job atomically with `FOR UPDATE SKIP LOCKED`.
- FIFO is enforced separately per Telegram user; a second active job for the same user is not claimed.
- Each job stores request kind, payload, chat/user ownership, processing message ID, attempts, lock expiry, response message ID, delivery state, and cleanup result.
- Supported queued input kinds are text, voice, photo, document, and long callback actions.
- `/start` and immediate connection/menu behavior do not show the processing indicator.
- Duplicate webhook delivery returns without a second status or response. Worker retries reuse the stored job.

## Processing indicator

1. On enqueue, send the silent custom-emoji status `Запрос в очереди…`.
2. On claim, edit the same message to `Обрабатываю…`.
3. Do not remove it until final success or a user-facing error has been confirmed delivered.
4. Cleanup is best effort and limited to two attempts.
5. Update/delete failures must not replace or block the main result.

Status updates, deletion, and delivery are recorded in `telegram_request_traces`. Trace details must not contain message text, bot tokens, webhook secrets, or bypass secrets.

## Delivery safety and recovery

- Before sending the final response, the webhook moves `delivery_state` from `pending` to `sending`; this is the delivery fence.
- Confirmed delivery records the Telegram response message ID and marks the job processed.
- An ambiguous result becomes `delivery_unknown`; it must not be automatically resent as if delivery had definitely failed.
- Stale running jobs with no started delivery may be requeued. Stale jobs already in `sending` become `delivery_unknown`.
- `resolve_telegram_delivery_unknown()` supports an explicit later decision to retry, mark delivered, or fail.
- Worker failures are retried only while delivery is known not to have started; bounded attempts eventually fail.

## Drafts and callbacks

Conversation state is stored in `telegram_conversations`, including `pending_action` and the active apartment. The assistant prepares actions, then inline callbacks allow the owner to confirm, edit, or cancel. Confirmed actions are executed through the same assistant/tool path; cancellation removes the draft without creating product data.

For every incoming update, reply assembly compares the pending action before and after assistant processing. A pre-existing pending action cannot replace or attach buttons to an unrelated text reply. Its card appears only if the current update created or changed it, or the owner explicitly requested to view/continue the draft; otherwise the pending action remains available for its existing callbacks. Unrelated text is not augmented with the old draft's JSON in the model input. Attachment replies retain their separate update/file identity checks.

Long confirmation/cancellation and utility-option callbacks are queued. Telegram's short callback spinner is acknowledged separately from the durable Homory processing status.

Tenant group delivery is prepared privately for the owner and sent only after explicit approval. Group pairing and statement delivery have separate service-role tables and deduplication.

## AI and media

- The assistant uses the OpenAI Responses API with tool calls against current Supabase data.
- Voice uses the configured transcription model before assistant processing.
- Photos and documents are downloaded server-side and stored in the private `asset-media` bucket when needed.
- AI prepares drafts; server code performs authoritative calculations and persistence where implemented.
- Each new Telegram attachment is processed without an earlier response or pending utility draft in the model input. A receipt reply and its buttons are scoped to the current update and file. If extraction does not prepare a bill, the earlier confirmation is closed without deleting an already saved draft record.
- A receipt binds automatically only when its extracted address uniquely matches an accessible apartment. Its file is stored under that apartment's `asset-media` path before the bill is saved. Separate receipts for one apartment and month remain separate bill records; the draft reply shows their combined mandatory charges. An exact file duplicate is rejected; a possible corrected receipt requires manual review and a fresh upload because automatic replacement is not yet supported.
- The Preview-only `/api/internal/utility-eval` route reuses the same `prepare_utility_bill` tool schema for blind receipt baselines, but intercepts the tool call and never reads or writes Supabase, Storage, Telegram state, or the production webhook.

## Environment variable names

Values must never be documented or requested in chat.

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `CRON_SECRET`
- `VERCEL_AUTOMATION_BYPASS_SECRET` (optional; needed for protected internal Preview requests)
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`
- `UTILITY_EVAL_TOKEN` (Preview/local only; protects the no-write receipt evaluation route)
- Supabase server/public variables listed in [`DEPLOYMENT.md`](DEPLOYMENT.md)

## Smoke test and canary

Before moving a webhook, verify on an immutable deployment URL:

- valid webhook secret accepted; invalid secret rejected;
- valid worker authorization accepted; invalid authorization rejected;
- one text request: queued -> running -> final response -> indicator removed;
- one real draft callback `Отменить`: no product data created;
- no duplicate status or final response;
- `queued=0`, `running=0`, and `delivery_unknown=0` after the test;
- Telegram pending updates are zero;
- logs and traces contain no message bodies or secrets.

When switching bots or deployments, use the correct `secret_token` and `drop_pending_updates=false`. Keep the previous working webhook target for rollback and do not disable the old bot until the new bot passes canary.

Before replacing the token with `@homory_bot`, verify deduplication is stable across bots. The current schema keys updates only by `update_id`; a bot-aware `bot_id` dimension is not present. Never ask the user to paste the new bot token into chat.
