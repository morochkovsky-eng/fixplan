# Deterministic receipt core

**Status:** design contract for specification 1, 2026-09-25.

This module is an offline boundary between future document reading and product persistence. It does not import Telegram, Supabase, Storage, model providers, or application state. The core accepts literal document geometry plus ID-only role labels and returns canonical entities, reconciliation diagnostics, and a draft decision.

## Layer boundaries

```text
untrusted visual output
  -> literal runtime validation
  -> server indexing and numeric tokenization
  -> ID-only role classification
  -> reference and ownership validation
  -> canonical entities
  -> E1 / E2 / E3 reconciliation
  -> mandatory-due and draft decisions
```

### Literal document

The visual layer may provide only:

- pages, blocks, rows, and cells;
- block layout: `table`, `kv`, `text`, or `code`;
- literal cell text;
- visual state: `ok`, `blank`, or `illegible`;
- normalized bounding boxes;
- row/column span;
- a visual header flag.

It cannot assign financial roles, parse amounts, select totals, or invent IDs. The server creates stable positional IDs:

```text
p1
p1.b3
p1.b3.r2
p1.b3.r2.c4
p1.b3.r2.c4#1
```

The last form addresses a numeric token inside a cell. Every visually present column remains represented, including blank and illegible cells. Literal `ok` becomes `present`; the other states remain distinct. Every row receives a SHA-256 hash of its normalized literal text.

### Role classification

Classification refers only to server IDs and enums. It cannot repeat or replace source text and numbers. Every source row must have exactly one row classification, including `unknown`.

An item uses one of two forms:

- `label_value`: explicit label cells, value cells, and numeric tokens;
- `table_columns`: a declared table schema plus column keys and numeric tokens.

Supported roles are structural, service, financial, meter/reference, and document-detail roles listed in `receipt-core/roles.ts`. Unknown enum values, broken IDs, cross-row references, invalid table columns, and duplicate numeric-token ownership are deterministic validation errors.

## Normalized field states

```text
printed         literal value exists, including zero
printed_blank   the labelled field exists and its value cell is blank
absent          no entity with this role exists
illegible       the entity exists but cannot be read
not_applicable  the field does not apply to the document
```

Zero is never converted to null. Blank and illegible values never become zero. A rejected child entity does not erase independently confirmed document-level fields.

## Monetary values

Money is parsed with decimal string arithmetic into `bigint` minor units. No floating-point operation is used for money. Numeric tokens retain their literal form, exact coefficient, scale, and source cell.

Fixed financial roles receive signs in code:

| Role | Canonical sign |
| --- | --- |
| `accrued_total`, `opening_debt`, `penalty` | positive |
| `opening_advance`, `payment`, `benefit` | negative |
| `recalculation`, `rounding` | printed sign |
| `payment_history` | historical only; excluded from E2 |

The core does not change a role or sign to make an equation close.

## Due candidates

Printed due candidates are separate from calculated evidence:

```ts
type DueCandidate = {
  amountMinor: bigint;
  scope: "period_only" | "with_balance" | "unknown";
  optional: "excluded" | "included" | "unknown";
  sourceTokenIds: string[];
};
```

Repeated printed occurrences of the same semantic candidate are deduplicated while preserving every source token. `computedDue`, future `machineDue`, and `mandatoryDue` remain separate values. A computed result never overwrites a printed candidate.

## Reconciliation

- **E1:** sum of confirmed service charges versus printed accrued total. Tolerance is one minor unit per service row.
- **E2:** document-specific balance equation versus printed due candidates. Fixed-role signs come from code; signed roles retain their printed signs. Only inclusion of explicitly disputed optional categories may be enumerated. Signs and arbitrary subsets are never searched.
- **E3:** confirmed volume multiplied by confirmed tariff versus a simple line amount. Mismatch creates a diagnostic; it does not replace the printed line amount.

Each equation returns `closed`, `open`, `insufficient`, or `ambiguous`, with machine-readable reasons and source IDs. More than one closing interpretation is `ambiguous`, never a false confirmation.

## Mandatory due

1. A candidate explicitly including optional charges cannot be automatically confirmed.
2. One reconciled printed candidate that excludes optional charges may be confirmed.
3. Multiple candidates, an open equation, or unknown optional semantics require review.
4. If only an optional-inclusive total is printed, an amount computed without optional charges is review-only.
5. Printed zero and negative values are valid and retain their signs.

## Draft decision

The core rejects only when the input is not a utility document, the whole file is unreadable, or both the period and every monetary amount are absent. Otherwise it returns a partial draft unless the mandatory amount is confirmed. A `partial_draft` is `needs_review`, does not enter a monthly total, and cannot become a payment without owner confirmation.

## Safe diagnostics

Public diagnostics contain only structural IDs, enum roles, hashes, states, equation deltas, and error codes. They exclude literal text, addresses, names, account numbers, document images, and provider payloads. A separate caller may retain the literal document inside an approved private boundary; this core never logs it.

## Non-goals

- vision/OCR/model calls or prompts;
- QR decoding;
- Telegram, UI, persistence, migrations, RLS, or Storage;
- provider-specific templates;
- current Production integration;
- repair of pending Telegram actions.
