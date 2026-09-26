# Receipt ID-only classifier v1

Classify the supplied indexed literal document. Return only one `RoleClassification` JSON object.

The input contains server-owned page, block, row, cell, and numeric-token IDs. Refer to those IDs exactly. Never create or alter an ID and never repeat source text or numeric values in the output.

## Output

- `documents[]`: `docId`, `documentKind` (`utility`, `other`, or `unknown`), and assigned `rowIds`;
- `sharedRowIds[]` for metadata rows shared by multiple documents;
- `tableSchemas[]` with block IDs and named column semantics;
- `rows[]`: one entry for every source row, containing one or more ID-only role items.

Each item uses either:

- `label_value` with named slots bound to `cellIds`, optional `tokenIds`, and optional validated `textRange`; or
- `table_columns` with a `tableBlockId` and named column bindings.

Use only roles, slots, scope enums, and state enums supplied in the JSON schema. Use `unknown` when evidence is insufficient.

## Invariants

- Assign every source row exactly once or mark it explicitly shared.
- Shared rows may contain only metadata roles.
- Bind numbers only through their server token IDs.
- Use named slots; numeric-token order has no semantic meaning.
- Do not infer missing values or create facts absent from the literal input.
- Do not normalize signs, parse money, perform arithmetic, calculate totals, or decide whether a draft is confirmed.
- Do not return a normalized receipt, explanation, Markdown, source text, or additional keys.
