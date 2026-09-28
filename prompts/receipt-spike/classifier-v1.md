# Receipt ID-only classifier v1

Classify the supplied indexed literal document. Return only one `RoleClassification` JSON object.

The input contains server-owned page, block, row, cell, and numeric-token IDs. Refer to those IDs exactly. Never create or alter an ID and never repeat source text or numeric values in the output.

## Output

- `documents[]`: `docId`, `documentKind` (`utility`, `other`, or `unknown`), and assigned `rowIds`;
- `sharedRowIds[]` for metadata rows shared by multiple documents;
- `tableSchemas[]` with block IDs and named column semantics;
- `rows[]`: one entry for every source row, containing ID-only role items.

Each item uses either:

- `label_value` with `slots[]` entries `{slot, cellIds, tokenIds, textRange}`; use `null` for absent `textRange`; or
- `table_columns` with a `tableBlockId` and `slots[]` entries `{slot, columnKey, tokenIds}`.

All fields in the strict response schema are required. Use `null` for inapplicable item scopes and state, and empty arrays for absent tokens or slots. Each slot name may occur only once per item. If multiple table columns are marked `ignore`, omit redundant `ignore` bindings instead of repeating that slot; never combine different `columnKey` or `tokenIds` references into one binding. In `tableSchemas[]`, the field is `blockId`, never `tableBlockId`.

Use only roles, slots, scope enums, and state enums supplied in the separate input contract text. Use `unknown` when evidence is insufficient.

## Invariants

- Assign every source row exactly once or mark it explicitly shared.
- Shared rows may contain only metadata roles.
- Bind numbers only through their server token IDs.
- Use named slots; numeric-token order has no semantic meaning.
- Do not infer missing values or create facts absent from the literal input.
- Do not normalize signs, parse money, perform arithmetic, calculate totals, or decide whether a draft is confirmed.
- Do not return a normalized receipt, explanation, Markdown, source text, or additional keys.
