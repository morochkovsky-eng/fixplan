# FixPlan production setup

## Stack

- GitHub: source repository and version history.
- Vercel: web app hosting.
- Supabase: database, owner login, guest access links, and media storage.

## Supabase

Current project:

- Supabase project: `Chat Brief`
- Project ref: `awjedoupwxxlfpebxdfb`

The project is linked locally and the migrations in `supabase/migrations` are applied.

For a fresh environment:

1. Link the Supabase project with `supabase link --project-ref awjedoupwxxlfpebxdfb`.
2. Run `supabase db push` to apply schema and seed migrations.
3. In Authentication, confirm that the owner user exists for `morochkovsky@gmail.com`.
4. In Storage, confirm that the `asset-media` bucket exists.

## Environment variables

Copy `.env.example` into Vercel project settings and fill:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
OWNER_EMAIL=morochkovsky@gmail.com
NEXT_PUBLIC_OWNER_EMAIL=morochkovsky@gmail.com
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY` must stay server-only and must not be exposed in the browser.
`OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_WEBHOOK_SECRET` are server-only secrets too.

## Telegram bot

1. Create the bot with BotFather and add the Telegram and OpenAI variables to Vercel.
2. Open FixPlan settings and select `Подключить мой Telegram`, or generate the same owner-only link with authenticated `POST /api/telegram/pairing`.
3. Apply the Supabase migrations before opening that link.
4. Register `https://<production-domain>/api/telegram/webhook` with Telegram `setWebhook`, passing the same `TELEGRAM_WEBHOOK_SECRET` as `secret_token`.

The bot is the owner's personal interface. A Telegram account is linked to the owner account, not to one apartment. The owner can list and switch between all apartments where they have owner or administrator access; every draft remains bound to the apartment where it was prepared. It supports text and Telegram voice conversations, reading cleanings, preparing a new cleaning, and extracting a utility-bill draft from a Telegram photo or PDF. A prepared cleaning or bill is persisted only after the owner explicitly sends `Создавай`. Bill attachments are kept in the private `asset-media` bucket and exposed to the web UI through short-lived signed URLs. Cleaners and masters do not use the bot; they continue to work through guest links for individual jobs. Group mode with a tenant is reserved by the product architecture but is not enabled in this first private-chat release.

The bill flow requires `20260906240000_add_utility_bill_receipt_storage.sql` and owner-level Telegram linking requires `20260907100000_link_telegram_to_owner_account.sql`. Telegram accepts bill images and PDFs up to 20 MB; unsupported files are rejected without creating a draft.

## Deployment

1. Push the project to GitHub.
2. Import the repository in Vercel.
3. Set the environment variables above.
4. Deploy with the default Next.js settings.

## Data model

The production schema keeps the core chain:

`Apartment -> Room -> Asset -> Event -> Inspection -> InspectionResult`

Master links are stored on `inspections.guest_token`. A master submits results through the guest route; every result is saved into the inspection report and duplicated into the asset timeline as an event.
