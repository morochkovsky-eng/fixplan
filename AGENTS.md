<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Homory agent context

Before every task, read:

1. [`docs/PROJECT.md`](docs/PROJECT.md)
2. [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)

Then read only the documents relevant to the task:

| Task | Also read |
| --- | --- |
| Architecture, API, entities, database | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Name, logo, favicon, metadata | [`docs/BRAND.md`](docs/BRAND.md) |
| UI, components, themes, responsive behavior | [`docs/UI.md`](docs/UI.md) |
| Telegram, AI, queue, callbacks | [`docs/TELEGRAM.md`](docs/TELEGRAM.md) |
| Vercel, env, Preview, Production, rollback | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |

Always inspect the current implementation. These documents guide work; they do not replace code inspection.

Do not change without explicit user approval:

- Production or Vercel aliases;
- the Telegram webhook;
- environment variables;
- Supabase schema, data, or migrations;
- Git tags;
- external integrations.

Never print secrets, tokens, full operational webhook URLs, or bypass secrets in chat, commands, documentation, reports, or traces. Do not combine unrelated UI, infrastructure, data, rebranding, and product-logic changes in one release.

When a task changes a documented fact, update the relevant file before finishing:

| Change | Update |
| --- | --- |
| Product positioning or boundaries | [`docs/PROJECT.md`](docs/PROJECT.md) |
| Implemented capabilities, defects, next steps | [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) |
| Architecture, API, database, entities | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Naming, assets, metadata | [`docs/BRAND.md`](docs/BRAND.md) |
| UI components, tokens, responsive behavior | [`docs/UI.md`](docs/UI.md) |
| Telegram pipeline or queue | [`docs/TELEGRAM.md`](docs/TELEGRAM.md) |
| Deployment, env, Production, rollback | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
