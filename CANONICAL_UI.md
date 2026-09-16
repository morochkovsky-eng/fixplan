# FixPlan Canonical UI

Status: approved production baseline as of 2026-09-16.

## Verified source

- Canonical source commit: `22ea965531f96f51ca88e76bb8c85174ac448bdd`.
- Verification tag: `production-verified-mint-danger-20260916`.
- Current production deployment: `dpl_CZANG39FitkDM5XK9MjjERzabUH4`.
- Preserved rollback deployment: `dpl_914RnthTQ2XRdAVvJuPqufDxEhZN`.

The production alias must not be inferred from a local workspace. A deployment is
canonical only when it is reproducible from the verified Git history and passes
the checks below.

## Interface architecture

The canonical interface uses:

- a horizontal top navigation and no left application sidebar;
- the existing shared components in `components/ui`;
- shadcn/Radix primitives with the FixPlan Mint tokens in `app/globals.css`;
- the current page structure rooted in `app/page.tsx` and
  `components/product-header.tsx`.

`HeroUI/Mint` is the name of FixPlan's visual language and token system. It does
not mean that the production application installs or depends on
`@heroui/react`.

The legacy vertical sidebar and the iOS UI experiment are not approved product
interfaces and must not be restored to production. Their source is retained in
archive branches for reference.

## Required routes

The following routes must remain available:

- `/dashboard`
- `/documents`
- `/assets/[id]`
- `/guest/[token]`
- `/cleaning/[token]`
- `/login`
- `/ui-lab`

The catch-all application route in `app/[...path]/page.tsx` is part of the
current routing architecture and must not be removed as legacy code.

## Danger actions

- `destructive-soft` starts a destructive action in the normal interface.
  Examples: delete a record, document, task, comment, or asset.
- `destructive` is reserved for the final irreversible confirmation inside an
  AlertDialog or confirmation dialog.
- Cancelling a confirmation must close the dialog without changing data.

## Release rule

Production releases must:

1. Start from a clean Git working tree on the canonical production branch.
2. Be built from committed source through a Preview deployment.
3. Never include a stash, local build output, patch file, or unrelated workspace.
4. Pass visual and functional review on the Preview before the production alias
   changes.
5. Preserve at least one verified rollback deployment.

Every UI release requires smoke checks at desktop and mobile widths, in Light
and Dark themes, for at least:

- `/dashboard`
- `/documents`
- `/assets/s-wc-boiler-control`
- `/ui-lab`

The checks must confirm the horizontal navigation, absence of the legacy
sidebar, absence of horizontal overflow, correct theme application, and no
blocking browser-console errors.

