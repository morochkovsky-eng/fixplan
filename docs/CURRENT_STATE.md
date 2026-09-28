# Homory: current state

**Verified:** 2026-09-25 against GitHub, the receipt investigation log, and Production commit `84d7fb95c2ca2c9d81397538873e9a758d744029`.

This is the single replace-in-place operational snapshot. Do not append a release diary here.

## Production

- URL: [https://fixplan-iota.vercel.app](https://fixplan-iota.vercel.app)
- Deployment: `dpl_B1jgupB9HzroWX3Xu6q9y6mX2thd`
- Current commit: `84d7fb95c2ca2c9d81397538873e9a758d744029`
- Previous Production commit: `771ddb64a5b6c335e342be35b9b064367797c594`
- Telegram queue foundation: `5301dad1360aa102494a984811d62f0243e18559`
- Queue tag: `production-homory-telegram-queue-20260918`
- Nearest receipt rollback deployment: `dpl_8HQ6ZZt6pyNoY2DQ3rvUPrteaqVP`
- Earlier web rollback: `dpl_CZANG39FitkDM5XK9MjjERzabUH4`
- Telegram Preview rollback: `dpl_DKfG3jWmp1Jxr8iXAMtHXPrQGGd5`

Release and rollback procedures are in [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Repository baseline

- Canonical GitHub default branch: `main`; verified head: `84d7fb95c2ca2c9d81397538873e9a758d744029`.
- New tasks branch from the current `main` head unless another verified base is explicitly required.
- Automatic Vercel Git deployment is disabled for `main`; PR and feature branches remain eligible for Preview deployments.
- Production remains an explicitly verified and promoted deployment rather than an automatic consequence of merging to `main`.

## Working web product

- Next.js web application with Supabase-backed apartments, rooms, assets, history, documents, inspections/work orders, cleanings, utility bills, meters, readings, and notifications.
- Horizontal top navigation is the canonical runtime shell.
- Light and Dark themes use the shared Mint semantic tokens.
- Stable URL handling covers the dashboard, plan, assets, documents, utilities, log, tasks, settings, guest work, login, and UI Lab surfaces.
- `destructive-soft` starts ordinary removal actions; solid `destructive` is reserved for final irreversible confirmation.
- The assistant supports compact and expanded desktop/mobile states and attachments.
- UI Lab documents the implemented primitives and the test asset page.

See [`UI.md`](UI.md) for verified geometry and the non-canonical experiments still present in the tree.

## Working Telegram product

- Production currently uses `@fixplanai_bot`.
- Text, voice, photos, documents, and long callbacks can enter the persistent queue.
- Per-user FIFO claiming, duplicate protection, processing indicators, delivery fencing, `delivery_unknown`, stale-job recovery, and bounded indicator cleanup are implemented.
- Draft actions require explicit confirmation or cancellation.
- Production includes PR #8's readable-image retry and evidence gate. PR #9's universal transcription/normalization pipeline remains open and is not deployed.
- The queue and status mechanism has passed real smoke and canary checks; the last recorded post-canary queue state was empty.

See [`TELEGRAM.md`](TELEGRAM.md) for the exact pipeline and release rules.

## Brand implementation

- Canonical product name: Homory.
- The exact wordmark and `h` symbol are present in `public/` and exposed through a shared component.
- The wordmark is used in the main and guest headers; the theme-aware `h` mark is used in assistant inputs.
- Full technical rebranding is incomplete: the repository, Vercel project/domain, Telegram production username, some UI strings, metadata, favicon, and Apple icon still retain FixPlan-era naming or assets.

See [`BRAND.md`](BRAND.md).

## Known product defects

1. Asset search can treat the whole user phrase as a literal query instead of resolving code, name, type, room, and context.
2. Data contains a duplicate asset code `B-02`; uniqueness and linked records require an audit.
3. Active FixPlan references remain in UI, code, package metadata, infrastructure, and documentation.
4. The new `@homory_bot` exists but is not connected to Production.
5. Favicon, Apple icon, and complete metadata migration are unfinished.
6. The authenticated dashboard needs another real-device mobile check after the next release.

## Technical debt

- `app/page.tsx` is a large client module: 9,740 lines at the verified commit. This is debt, not authorization for an immediate refactor.
- The experimental iOS prototype and its `iOS Concept` link remain physically present under `app/ui-lab/ios/`. Remove or archive them only after explicit confirmation that they are no longer needed.
- Unused legacy sidebar selectors remain in `app/globals.css`. Remove them only after checking for hidden dependencies and visual regression.
- The GitHub repository and Vercel project are still named `fixplan`; renaming is a separate infrastructure change.
- Universal receipt transcription and normalization are being prepared as an isolated PR from `84d7fb9`. The additive evidence migration must be reviewed and applied before that code can be deployed; Production still runs the previous extractor until a separate release is approved.
- A failed receipt currently clears the conversation `pending_action` even when the preceding receipt draft row remains stored. This can make the older draft inaccessible from its buttons; repair and recovery of that state are a separate task.
- PR #9's sanitized offline evaluation found no Production-ready receipt model configuration. Terra preserved all tested periods, accruals, and mandatory totals but missed one printed due date, produced extra structural rows, and was unstable on T08 balances; the GPT-5.5 baseline had two false rejections on the complex PDF. See [`RECEIPT_EVAL_20260924.md`](RECEIPT_EVAL_20260924.md).

## Agreed next stages

1. Complete the bounded post-fix Terra receipt evaluation and independent architecture review; do not merge PR #9 until its acceptance gate passes.
2. Repair receipt `pending_action` recovery as a separate narrow change.
3. Maintain compact agent documentation.
4. Complete rebranding and move safely to the new Telegram bot.
5. Audit data integrity and resolve `B-02`.
6. Improve asset search and the home's long-term memory.
7. Extend tasks, calculations, and multi-user scenarios.

Each stage should remain isolated. Do not combine UI, infrastructure, data, rebranding, and product-logic changes in one release.
