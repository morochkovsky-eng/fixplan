# Homory brand

## Canonical naming

- Product, service, and assistant name: **Homory**.
- Category: **AI-помощник владельца жилья**.
- Working landing phrase: **«Дом помнит всё»**.
- Do not use `Homory App`, `Homory Assistant AI`, or a separate character name as the primary product name.

Brand character: calm, attentive, practical, reliable, and modern. AI explains how the product works; it is not required in the proper name.

## Channels

- Telegram display name: `Homory`.
- New Telegram username: `@homory_bot`.
- Current Production bot: `@fixplanai_bot` until a separately approved migration succeeds.
- Preferred Instagram username: `@homory.app`.
- Instagram display name: `Homory · AI для дома`.

## Implemented assets

| Asset | Location | Usage |
| --- | --- | --- |
| Homory wordmark | `public/homory-logo.svg` | Main and guest headers; reference size 124 × 35 px |
| Homory `h` symbol | `public/homory-symbol.svg` | Assistant prompt mark; reference size 16 × 16 px |
| Shared React components | `components/homory-brand.tsx` | `HomoryLogo` and `HomorySymbol` |

The `h` symbol is rendered through a CSS mask with `currentColor` in `.homory-symbol`, so it follows Light/Dark foreground colors. Do not replace it with a hand-drawn approximation.

## Incomplete migration

- Technical renaming is not complete.
- The GitHub repository, package name, Vercel project, production URL, callback prefixes, cookie names, and some user-visible text still contain FixPlan.
- `public/favicon.svg` and metadata icons have not been migrated to the Homory symbol; Apple icon work is also pending.
- `homory.vercel.app` is a plan, not a confirmed address.
- The new Telegram bot exists but is not connected to Production.

Old names in Git history, tags, archived branches, and rollback deployments do not require destructive removal. Active runtime and metadata changes must be handled as a separate, staged rebranding release; see [`DEPLOYMENT.md`](DEPLOYMENT.md).
