# Homory deployment

**Verified:** 2026-09-19.

## Current contour

| Layer | Current role |
| --- | --- |
| GitHub | Source and review history in the existing `morochkovsky-eng/fixplan` repository |
| Vercel Preview | Immutable build and UI/product smoke target for each change |
| Vercel deployment | Build promoted by alias only after verification |
| Production alias | [https://fixplan-iota.vercel.app](https://fixplan-iota.vercel.app) |
| Telegram webhook | Points the production bot to an immutable verified deployment endpoint |
| Supabase | Auth, Postgres, private Storage, queue state, and migrations |

The current alias points to deployment `dpl_3hU8pCeP2jq9xchtrMLa1mDdYDUz`, built from commit `dd848eb330b68dc2169fe717b2b21ce753ef9a23`. It originated as a Git Preview and was assigned to the production alias without rebuilding.

The repository and Vercel project are still named `fixplan`. `homory.vercel.app` is only a planned address; availability and migration have not been confirmed.

## Environment names

Maintain separate Preview and Production values where applicable. Never put values in documentation.

Application and Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `OWNER_EMAIL`
- `NEXT_PUBLIC_OWNER_EMAIL`

AI and Telegram:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `CRON_SECRET`
- `VERCEL_AUTOMATION_BYPASS_SECRET` when protected automated requests require it

Server-only values must never use a `NEXT_PUBLIC_` prefix. Do not print values in commands, chat, build output, traces, or reports.

## Standard release order

1. Create a clean branch and commit from the verified canonical base.
2. Run lint, TypeScript, the full test suite, and a production build.
3. Create a Git-backed Preview.
4. Perform route and product smoke tests, including desktop/mobile and Light/Dark for UI changes.
5. Create a Production-environment deployment without immediately assigning the public alias.
6. Verify its immutable deployment URL, commit provenance, environment presence, and logs.
7. If Telegram changed, point the webhook to the immutable deployment and run a canary.
8. Assign the production alias to that same tested deployment without rebuilding.
9. Recheck the main production routes and, when relevant, one Telegram message.
10. Create an annotated Git tag and retain a known-good rollback deployment.

Never deploy from a dirty workspace. Do not use a local directory as the production source when a clean Git commit can be built. A successful build does not replace product smoke tests.

## Minimum route checks

For changes that can affect the shell or shared components, check:

- `/dashboard`
- `/documents`
- `/assets/s-wc-boiler-control`
- `/ui-lab`
- relevant guest and login routes
- desktop/mobile and Light/Dark
- horizontal navigation, overflow, and browser console errors

## Rollback

### Web alias

Reassign the production alias to the last verified deployment. Do not rebuild the rollback target. Record both the failed and restored deployment IDs for diagnosis.

Current known points:

- nearest UI rollback: `dpl_J27B6aMJ6o5Jf7GW7po7D4SfEwy4`;
- earlier canonical web rollback: `dpl_CZANG39FitkDM5XK9MjjERzabUH4`.

### Telegram webhook

Return the webhook to the last verified immutable endpoint with the correct `secret_token` and `drop_pending_updates=false`. Do not point it to a known-broken production endpoint. The recorded Telegram Preview rollback is `dpl_DKfG3jWmp1Jxr8iXAMtHXPrQGGd5`.

After rollback, verify `getWebhookInfo`, one controlled message if safe, and an empty active queue. Do not delete the failed deployment until diagnosis is complete.

## Change controls

- Production aliases, webhook targets, environment variables, Supabase migrations/data, and Git tags require explicit approval.
- Keep old deployments and tags until a stable, reproducible replacement and at least one rollback point exist.
- Rebranding, queue infrastructure, database changes, and UI changes should be separate releases.
- The older `docs/production-setup.md` contains historical FixPlan setup details; prefer this file and current code for release work.
