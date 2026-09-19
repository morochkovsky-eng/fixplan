# Homory UI

**Verified against code:** 2026-09-19, commit `dd848eb330b68dc2169fe717b2b21ce753ef9a23`.

## Canonical runtime

- Shared primitives are shadcn/Radix components styled by project tokens.
- HeroUI Mint describes the visual language and semantic colors. `@heroui/react` is not a runtime dependency.
- Light and Dark themes use `next-themes`, default to the system setting, and share semantic token names.
- The canonical shell has a horizontal, sticky top header and horizontally scrollable navigation.
- The legacy left sidebar is not used by the current runtime.
- Geist and Geist Mono are loaded through `next/font`.

Primary product routes implemented by the main shell:

- `/` and `/dashboard`
- `/plan`
- `/assets` and `/assets/[id]`
- `/documents`
- `/utilities`
- `/log`
- `/inspection`
- `/tasks`, `/tasks/new`, `/tasks/report/[id]`
- `/settings`

Additional supported surfaces:

- `/guest/[token]`
- `/cleaning/[token]`
- `/login`
- `/ui-lab` and `/ui-lab/asset`

## UI Lab

`/ui-lab` is the implemented component catalog and source-of-truth companion to the current Figma UI Kit. It documents foundations, Button, Input, Select, Tabs, Badge, Card, attachments, PromptInput, and AssistantPanel. `/ui-lab/asset` exercises those decisions on a dense asset page.

An accessible `iOS Concept` experiment still exists under `app/ui-lab/ios/` and is linked from the catalog. It is not canonical and must not guide product work unless the user explicitly says so. Experimental files in UI Lab do not imply use in the main application.

## Component geometry

Current CSS tokens:

| Role | Value |
| --- | ---: |
| Compact radius | 8 px |
| Input radius | 8 px |
| Textarea radius | 10 px |
| Button / Select radius | 12 px |
| Card radius | 24 px |
| Tabs container radius | 14 px |
| Tab radius | 6 px |
| Active tab radius | 12 px |
| Assistant panel radius | 16 px |
| Assistant field radius | 14 px |
| Pill / Badge radius | 9999 px |

Control tokens are 32, 36, 40, and 48 px. Different sizes are allowed when they represent different roles; avoid unexplained differences between controls serving the same role.

## Destructive actions

- `destructive-soft`: ordinary delete/remove actions and buttons that open confirmation.
- `destructive`: final irreversible action inside the confirmation dialog.

Do not use solid destructive styling as the normal delete button in a form. Success and accent variants are independent.

## PromptInput and attachments

- Compact input: 44 px.
- Input with files: 130 px.
- Bottom text/action row remains 44 px.
- List attachment: 336 × 74 px.
- Grid attachment: 74 × 74 px.
- Attachment radius: 10 px.
- Attachment lists scroll horizontally without expanding the viewport.

## Assistant states

Desktop and mobile share the same assistant content and prompt primitives:

- collapsed prompt row;
- expanded panel with message history;
- pending actions;
- attachments above the text row;
- separate mobile menu button.

On mobile, the menu is a 224 px overlay positioned above the dock (`bottom: 64px`), with its own layer, constrained height, and vertical scrolling. It must not render underneath the prompt or create horizontal overflow.

The wordmark comes from `HomoryLogo`; the assistant mark comes from `HomorySymbol`. The `h` mark is 16 × 16 px and theme-aware through `currentColor`.

## Verification rules

Every UI change must be checked against both the current Figma UI Kit and `/ui-lab`, then visually verified on:

- desktop and mobile (including 390 px; use 360 px when layout risk warrants it);
- Light and Dark;
- default, hover, focus, active, disabled, loading, error, and overflow states relevant to the change;
- authenticated product routes, not only the public catalog.

A successful build or source test does not replace screenshot-level verification. Architecture work should preserve the accepted appearance unless the task explicitly requests a design change.

## Confirmed debt

- Unused `.sidebar*`, `.sidebar-search*`, and `.app-shell.sidebar-collapsed` rules remain physically present in `app/globals.css`. They are not evidence of runtime sidebar use. Remove them only in an approved cleanup with dependency search and visual regression checks.
- The iOS experiment remains in UI Lab despite earlier notes describing its removal.
- Do not perform either cleanup opportunistically during unrelated work.
