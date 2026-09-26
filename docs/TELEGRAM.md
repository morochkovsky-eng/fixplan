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

- The general assistant uses the OpenAI Responses API with tool calls against current Supabase data. Receipt recognition is a separate provider-neutral pipeline and receives only the current file.
- Voice uses the configured transcription model before assistant processing.
- Photos and documents are downloaded server-side with bounded file size and request timeouts. The original bytes remain unchanged in Storage. Image recognition uses an auto-oriented, moderately normalized copy plus metrics for both the full image and the detected document/text region. Resolution, compression, sharpness, contrast and exposure are warnings unless the input is demonstrably unusable (failed decode, critical dimensions, missing content or destroyed detail); a normal Telegram JPEG or a large blank form area is not a rejection reason by itself. PDFs bypass `sharp`, are structurally limited to 30 pages, and use the file-input vision path.
- Receipt recognition has four explicit stages: literal visual transcription, semantic normalization from that transcription, deterministic evidence/financial validation, and partial-draft persistence. Transcription preserves pages, text regions, label/value pairs, original table cells and row roles without deciding balances or totals. Its flat evidence graph records a page, normalized bounding box, visual kind, semantic section, literal label/value and whether a region is genuinely composite. Normalized fields retain the printed evidence, source region IDs, and `confirmed`, `needs_review`, or `missing` status; money is represented in integer minor units.
- Only document type, billing period, and mandatory amount block a partial draft. Provider, reference address, account, dates, individual service lines, meters, and historical payment may remain missing or require review. The owner-facing card lists the fields that need attention instead of claiming generic image blur.
- A field-level fallback runs at most once and receives only unresolved fields and current-document regions. A missing due date uses one header-only targeted pass instead of repeating the complete document interpretation. Neither fallback can replace first-pass confirmed values; a conflict becomes `needs_review`. No previous Telegram response, pending action, or other tool context enters either recognition pass.
- Deterministic evidence validation rejects a child entity when its number is absent from cited regions, its region belongs to another section, a heading/total/normative is presented as a service or meter, a blank cell becomes a reading, or one non-composite region is reused by two entities. Rejecting a child row does not erase a separately confirmed period or document total.
- Printed financial components retain their literal role, signed amount, inclusion in mandatory due and evidence. Canonical debt, advance, payment, recalculation, penalty and total fields are derived or cross-checked from those components; the server reproduces the supplier's printed formula instead of imposing one universal balance formula. Ambiguity becomes `needs_review`, never a sign correction.
- Deterministic arithmetic validation sums only confirmed charge rows, never section headings or subtotal rows; applies volume × tariff only to simple printed formulas; separates debt, advance, current-period payments and historical `lastPayment`; excludes voluntary services; and never substitutes a calculated amount for an unreadable printed value.
- The entire receipt pipeline has one 240-second deadline within the 300-second route budget. Every provider stage receives only the remaining time, fallback is skipped without at least 45 seconds of safe budget, active requests are aborted on timeout, the current temporary file is removed, and a pre-existing draft/pending action is preserved.
- AI prepares drafts; server code performs authoritative calculations and persistence where implemented.
- Each new Telegram attachment is processed without an earlier response or pending utility draft in the model input. A receipt reply and its buttons are scoped to the current update and file. If extraction does not prepare a bill, the earlier confirmation is closed without deleting an already saved draft record.
- Receipt attachments currently use an explicit temporary `single_apartment` routing mode. The target must be supplied as a stable apartment UUID in the server-only `TELEGRAM_RECEIPT_APARTMENT_ID`; no apartment ID is embedded in the code. Every request validates that the configured apartment exists and belongs to the connected owner, and missing or invalid configuration fails without creating a bill. The printed address is stored as reference data only and does not route the file. `TELEGRAM_RECEIPT_ROUTING_MODE=address` preserves the future address-routing path, but it is not the default.
- The single-apartment rule applies only to receipt attachments. Text, voice, tasks, assets, cleanings, readings, and other assistant actions keep their normal active-apartment behavior.
- Each attachment creates its own draft `utility_bills` row, scoped by Telegram update ID, private Storage path, and SHA-256 fingerprint. Exact duplicates are rejected. Separate documents in the same month are never merged into one row; the reply computes an in-memory monthly summary of their mandatory totals.
- Receipt extraction stores provider/document metadata, separate financial fields in integer minor units, normalized service lines, meter entries, and voluntary charges. Unreadable values must be `null`; template-based guesses, typical services and values from earlier documents are forbidden. A receipt with unreadable critical fields creates no bill or pending action, and its temporary Storage object is removed after processing.
- Before persistence, server code checks service-line totals against period accrual, `volume × tariff` for rows explicitly classified as a simple one-rate calculation, top-level charge/balance/payment/adjustment/penalty arithmetic, and exclusion of voluntary charges. Zoned, tiered and composite rows are not forced through a simple formula. An unexplained material contradiction blocks the draft and returns a safe retry/manual-review message; doubtful values are never silently adjusted into agreement.
- A missing or ambiguous billing month does not discard the file. The draft remains in `collect_utility_bill`; the owner can provide an exact month and year in a later message without uploading the document again. Confirmation buttons appear only after the period is resolved.
- Telegram renders a full audit-style breakdown and splits long responses into bounded messages; the keyboard is attached only to the final chunk. Voluntary services are shown separately and excluded from the mandatory monthly total unless the document explicitly includes them.
- A possible corrected receipt still requires manual review and a fresh upload because automatic replacement is not yet supported.
- The Preview-only `/api/internal/utility-eval` route reuses the same `prepare_utility_bill` tool schema for blind receipt baselines, but intercepts the tool call and never reads or writes Supabase, Storage, Telegram state, or the production webhook.
- The 2026-09-24 offline receipt evaluation is recorded in [`RECEIPT_EVAL_20260924.md`](RECEIPT_EVAL_20260924.md), with run-level mismatch attribution in [`RECEIPT_ERROR_ATTRIBUTION_20260924.md`](RECEIPT_ERROR_ATTRIBUTION_20260924.md). Neither the Terra candidate nor the pinned GPT-5.5 baseline met the Production acceptance gate; model configuration alone is not an approved release path.

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
- `OPENAI_RECEIPT_TRANSCRIPTION_MODEL`
- `OPENAI_RECEIPT_NORMALIZATION_MODEL`
- `UTILITY_EVAL_TOKEN` (Preview/local only; protects the no-write receipt evaluation route)
- `TELEGRAM_RECEIPT_APARTMENT_ID` (optional temporary single-object target; must be an apartment accessible to the owner)
- `TELEGRAM_RECEIPT_ROUTING_MODE` (optional; defaults to `single_apartment`, reserved `address` mode restores address routing)
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
