# Homory architecture

**Code baseline:** `dd848eb330b68dc2169fe717b2b21ce753ef9a23` (verified 2026-09-19).

This document describes the implementation, not a proposed target architecture. Product intent is in [`PROJECT.md`](PROJECT.md).

## Stack

- Next.js 16 App Router, React 19, TypeScript.
- Tailwind CSS 4 plus project CSS tokens.
- shadcn/Radix primitives and Lucide icons.
- Supabase Postgres, Auth, and private Storage.
- OpenAI Responses API for assistant reasoning and tool calls; OpenAI transcription for Telegram voice.
- Telegram Bot API.
- Vercel for builds, routes, server functions, and aliases.
- Node test runner plus source-level regression tests.

## Repository map

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Main client application, route parsing, data loading, and most owner workflows |
| `app/[...path]/page.tsx` | Maps product deep links to the main client application |
| `app/api/` | Authenticated owner APIs, guest APIs, assistant, Telegram webhook/worker |
| `app/guest/[token]/` | Contractor inspection/work-order guest UI |
| `app/cleaning/[token]/` | Cleaner guest UI |
| `app/ui-lab/` | Component catalog, test asset page, and a non-canonical iOS experiment |
| `components/ui/` | Shared shadcn/Radix primitives |
| `components/ai-elements/` | Assistant messages, prompt input, attachments, task presentation |
| `lib/server/` | Server-only assistant, Telegram, utility, cleaning, and notification logic |
| `lib/supabase/` | Browser, server, admin clients and generated database types |
| `supabase/schema.sql` | Consolidated current schema reference |
| `supabase/migrations/` | Ordered database history; never edit or apply without approval |
| `tests/` | Build/source regression tests for UI, data workflows, Telegram, and design tokens |

## Client and server boundaries

The main owner UI is a client application in `app/page.tsx`. It parses stable paths such as `/dashboard`, `/assets/[id]`, and `/documents`, then calls server route handlers under `app/api/`.

Server routes:

- validate Supabase identity and apartment membership for owner operations;
- use the service-role client only on the server;
- scope reads and writes to the selected apartment;
- issue short-lived signed URLs for private media;
- call OpenAI and Telegram only from server code.

Guest work is token-scoped through inspection or cleaning `guest_token` values. Guest routes expose only the job represented by that token.

## Authentication and authorization

- Owner login uses Supabase email/password in `/login`.
- Server routes call `requireApartmentAccess()`, which verifies the Supabase user and a matching `apartment_members` row.
- The selected apartment is stored in the `fixplan_apartment_id` cookie, with membership-checked fallback to the user's first apartment.
- Roles are `owner`, `admin`, and `viewer`; mutation routes must still enforce the role appropriate to the action.
- `app/chatgpt-auth.ts` contains optional Sign in with ChatGPT helpers, but the current product APIs use Supabase access checks.
- Guest access uses unguessable per-job tokens and does not grant general apartment membership.

## Product entities

The main ownership chain is:

```text
Apartment
├── ApartmentMember
├── Room
│   └── Asset
│       ├── Event
│       ├── AssetMedia / Document
│       └── InspectionResult
├── Inspection / WorkOrder
│   ├── InspectionResult
│   └── guest_token
├── Cleaning
│   ├── CleaningMedia
│   └── guest_token
├── UtilityBill
│   └── AssetMedia receipt
├── UtilityMeter
│   └── UtilityReading
└── NotificationEvent
```

Telegram adds account, conversation, group pairing, statement delivery, update queue, and trace records linked back to the owner and apartment.

## Supabase storage

Structured product information lives in Postgres. The private `asset-media` bucket stores plans, asset/event media, documents, utility receipts/readings, cleaning photos, and Telegram attachments. Server routes generate short-lived signed URLs rather than making the bucket public.

Row-level security protects owner-facing tables. Telegram queue and group-delivery tables are service-role only.

## Main API surfaces

Owner/data routes:

- `/api/app-data`, `/api/apartments`, `/api/settings`, `/api/plan`
- `/api/assets`, `/api/assets/[id]`, asset event routes, category routes
- `/api/documents`, `/api/inspections`, `/api/cleanings`
- `/api/utility-bills`, `/api/utility-meters`, `/api/utility-readings`
- `/api/notifications`, `/api/assistant`

Guest routes:

- `/api/guest/[token]` and photo upload
- `/api/cleanings/guest/[token]` and photo upload

Telegram routes:

- `/api/telegram/pairing`
- `/api/telegram/group`
- `/api/telegram/webhook`
- `/api/telegram/worker`

See [`TELEGRAM.md`](TELEGRAM.md) for queue semantics.

## Data flow map

```text
Owner web UI
  -> authenticated Next.js API
  -> Supabase Postgres / private Storage
  -> structured response
  -> web UI

Telegram update
  -> authenticated webhook
  -> telegram_updates + processing status
  -> worker claims per-user FIFO job
  -> internal authenticated webhook execution
  -> OpenAI tools + Supabase product data
  -> confirmed Telegram delivery
  -> processing-status cleanup + trace

Guest link
  -> token-scoped guest API
  -> inspection/cleaning result + media
  -> product history / notification
```

## Current structural constraint

`app/page.tsx` centralizes most client behavior. Future extraction should preserve route behavior and visual output unless a separately approved task says otherwise.
