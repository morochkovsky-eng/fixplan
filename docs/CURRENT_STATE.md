# Homory: current state

**Verified:** 2026-09-19 against production deployment metadata and commit `dd848eb330b68dc2169fe717b2b21ce753ef9a23`.

This is the single replace-in-place operational snapshot. Do not append a release diary here.

## Production

- URL: [https://fixplan-iota.vercel.app](https://fixplan-iota.vercel.app)
- Deployment: `dpl_3hU8pCeP2jq9xchtrMLa1mDdYDUz`
- Current commit: `dd848eb330b68dc2169fe717b2b21ce753ef9a23`
- Previous UI commit: `69cc0df64c62630fde51dd9958922e43eddebf93`
- Telegram queue foundation: `5301dad1360aa102494a984811d62f0243e18559`
- Queue tag: `production-homory-telegram-queue-20260918`
- Nearest UI rollback deployment: `dpl_J27B6aMJ6o5Jf7GW7po7D4SfEwy4`
- Earlier web rollback: `dpl_CZANG39FitkDM5XK9MjjERzabUH4`
- Telegram Preview rollback: `dpl_DKfG3jWmp1Jxr8iXAMtHXPrQGGd5`

Release and rollback procedures are in [`DEPLOYMENT.md`](DEPLOYMENT.md).

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

## Agreed next stages

1. Maintain compact agent documentation.
2. Complete rebranding and move safely to the new Telegram bot.
3. Audit data integrity and resolve `B-02`.
4. Improve asset search and the home's long-term memory.
5. Extend tasks, calculations, and multi-user scenarios.

Each stage should remain isolated. Do not combine UI, infrastructure, data, rebranding, and product-logic changes in one release.
