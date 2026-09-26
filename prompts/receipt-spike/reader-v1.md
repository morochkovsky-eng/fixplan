# Receipt literal reader v1

Read only what is visibly present in the supplied document image. Return one JSON object matching `VisualDocumentInput`.

## Output boundary

Return only:

- `readable`;
- `pages[]` with pixel `width` and `height`;
- `blocks[]` with `layout`, normalized `bbox`, and `rows`;
- `cells[]` with literal `text`, `state`, normalized `bbox`, and optional `colSpan`, `rowSpan`, `isHeader`.

Allowed block layouts are `table`, `kv`, `text`, and `code`. Allowed cell states are `ok`, `blank`, and `illegible`.

## Literal rules

- Preserve printed characters, signs, decimal separators, spaces, line breaks, abbreviations, and spelling.
- Keep every visible table cell, including blank cells.
- Use `blank` for a visibly empty cell and `illegible` only when the cell exists but its content cannot be read.
- Do not fill blank or illegible cells.
- Keep separate documents, sections, rows, columns, subtotals, headers, and meter fields as separate visual structures.
- A visual line wrap inside one logical cell may remain one cell.
- A QR or barcode is a `code` block with an empty literal cell; do not decode it.

## Forbidden output

Do not return IDs, roles, document type, provider interpretation, billing period interpretation, parsed dates, parsed numbers, money, normalized signs, totals, confidence-based guesses, or any field not present in the literal contract. Do not calculate anything.
