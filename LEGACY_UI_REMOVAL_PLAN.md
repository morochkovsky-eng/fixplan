# Legacy UI Removal Plan

Status: audit only. No removal has been performed.

## Embedded iOS experiment

Candidates for a separate removal patch:

- `app/ui-lab/ios/page.tsx`
- `app/ui-lab/ios/ios-asset.tsx`
- `app/ui-lab/ios/ios.module.css`
- the `iOS Concept` link to `/ui-lab/ios` in `app/ui-lab/page.tsx`

Evidence:

- `page.tsx` imports `ios-asset.tsx` only inside the `/ui-lab/ios` route.
- `ios-asset.tsx` imports `ios.module.css` only inside that route.
- The only reference from the retained UI is the explicit link in
  `app/ui-lab/page.tsx`.
- No tests reference `/ui-lab/ios`, `iOS Concept`, `ios-asset`, or
  `ios.module.css`.
- The current application package has no iOS-specific dependency required by
  these files.

Archive source: branch `archive/ios-ui` at
`22ea965531f96f51ca88e76bb8c85174ac448bdd`.

## Legacy sidebar styles

Candidates in `app/globals.css`:

- `.app-shell.sidebar-collapsed` blocks;
- `.sidebar` and `.sidebar-heading` blocks;
- `.sidebar-collapsed .sidebar` and its heading/brand/button blocks;
- `.sidebar-search`, `.sidebar-search-field`, and `.sidebar-search-results`
  blocks;
- responsive `.sidebar` and `.sidebar .button` blocks.

Evidence:

- Repository-wide search finds no `sidebar-collapsed`, `sidebar-heading`,
  `sidebar-search`, or sidebar class assignment outside `app/globals.css`.
- The current shell renders `ProductHeader` and the horizontal
  `product-navigation` instead.
- Commit `517404a` removed the sidebar JSX; its parent `c255b2b` is the last
  source revision containing the runtime sidebar.
- No current tests refer to the legacy sidebar selectors.

The generic `--sidebar-*` theme variables are not included in this removal
candidate yet. They follow the broader shadcn token convention and should be
handled in a separate token audit even though current runtime search finds no
component use.

Archive source: branch `archive/legacy-sidebar` at
`c255b2bc56d766a583ff682aae1e848e4b088c62`.

## Required checks for the removal patch

Before merging the future removal patch:

1. Repeat repository-wide import and selector searches.
2. Run the complete automated test suite and production build.
3. Check `/dashboard`, `/documents`, `/assets/s-wc-boiler-control`, and
   `/ui-lab` at desktop and mobile widths in Light and Dark themes.
4. Confirm `/guest/[token]`, `/cleaning/[token]`, and `/login` still render.
5. Confirm navigation remains horizontal and no horizontal overflow appears.

