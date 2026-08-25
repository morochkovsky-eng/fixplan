# FixPlan production setup

## Stack

- GitHub: source repository and version history.
- Vercel: web app hosting.
- Supabase: database, owner login, guest access links, and media storage.

## Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Run `supabase/seed.sql` to create the Shpalernaya apartment catalog.
4. In Authentication, create the owner user for `morochkovsky@gmail.com`.
5. In Storage, confirm that the `asset-media` bucket exists.

## Environment variables

Copy `.env.example` into Vercel project settings and fill:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
OWNER_EMAIL=morochkovsky@gmail.com
NEXT_PUBLIC_OWNER_EMAIL=morochkovsky@gmail.com
```

`SUPABASE_SERVICE_ROLE_KEY` must stay server-only and must not be exposed in the browser.

## Deployment

1. Push the project to GitHub.
2. Import the repository in Vercel.
3. Set the environment variables above.
4. Deploy with the default Next.js settings.

## Data model

The production schema keeps the core chain:

`Apartment -> Room -> Asset -> Event -> Inspection -> InspectionResult`

Master links are stored on `inspections.guest_token`. A master submits results through the guest route; every result is saved into the inspection report and duplicated into the asset timeline as an event.
