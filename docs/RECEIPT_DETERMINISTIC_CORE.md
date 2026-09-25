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

It cannot classify the document as a utility receipt, assign financial roles, parse amounts, select totals, or invent IDs. The server creates stable positional IDs:

```text
p1
p1.b3
p1.b3.r2
p1.b3.r2.c4
p1.b3.r2.c4#1
```

The last form addresses a numeric token inside a cell. Every visually present column remains represented, including blank and illegible cells. Literal `ok` becomes `present`; the other states remain distinct. Every row receives a SHA-256 hash of its normalized literal text.

### Role classification

The second layer first classifies the document as `utility`, `other`, or `unknown`. Classification refers only to server IDs and enums. It cannot repeat or replace source text and numbers. Every source row must have exactly one row classification, including an item with role `unknown` when no narrower role is supported.

There is no row-level role. A row contains one or more independently validated items:

- `label_value`: named slots bound to explicit cells and, where applicable, numeric tokens;
- `table_columns`: named slots bound to columns in a declared table schema.

Product meaning never comes from numeric-token order. The contract supports named slots such as `volume`, `tariff`, `charge`, `row_total`, `meter_prev`, `meter_curr`, `consumption`, and each financial role. `service_charge`, meter entries, and financial components are built only from their allowed slots. A server-owned role/slot table defines the required and allowed slots for every item role.

Supported roles are structural, service, financial, meter/reference, and document-detail roles listed in `receipt-core/roles.ts`. Unknown enum values, broken IDs, cross-row references, invalid table columns, invalid role/slot combinations, and duplicate numeric-token ownership are deterministic validation errors. Validation is two-phase: invalid rows are removed before global token ownership is resolved. As a result, an invalid row cannot reserve a token used by another row, and classifier row/item order cannot choose a winner.

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

Fixed financial roles receive signs in code only when the printed value has no explicit sign:

| Role | Canonical sign |
| --- | --- |
| `accrued_total`, `opening_debt`, `penalty` | positive |
| `opening_advance`, `payment`, `benefit` | negative |
| `recalculation`, `rounding` | printed sign |
| `payment_history` | historical only; excluded from E2 |

An explicit matching sign is retained. An explicit sign that contradicts the fixed role produces `fixed_role_sign_conflict`; that component is excluded from confirmed E2 evidence and the result requires review. The core does not change a contradictory printed sign to make an equation close.

## Due candidates

Printed due candidates are separate from calculated evidence:

```ts
type DueCandidate = {
  id: string;
  amountMinor: bigint;
  scope: "period_only" | "with_balance" | "unknown";
  optional: "excluded" | "included" | "unknown";
  sourceItemIds: string[];
  sourceTokenIds: string[];
};
```

Candidates are duplicates only when amount, due scope, and optional scope are compatible. Equal amounts with conflicting axes remain separate and produce a diagnostic. Repeated occurrences of the same semantic candidate preserve every source item and token. Reconciliation records the chosen candidate and its source IDs. `computedDue`, future `machineDue`, and `mandatoryDue` remain separate values. A computed result never overwrites a printed candidate.

## Reconciliation

- **E1:** sum of confirmed service charges versus printed accrued total. Tolerance is one minor unit per service row.
- **E2:** document-specific balance equation versus printed due candidates. Fixed-role signs come from code only for unsigned values; signed roles retain their printed signs. Independent binary flags are allowed only for explicitly disputed categories. At most three flags and eight combinations are evaluated. Signs and arbitrary subsets are never searched.
- **E3:** confirmed volume multiplied by confirmed tariff versus a simple line amount. Mismatch creates a diagnostic; it does not replace the printed line amount.

Each equation returns `closed`, `open`, `insufficient`, or `ambiguous`, with machine-readable reasons and source IDs. E2 also returns the applied formula, selected candidate, and included component IDs. Closures with identical non-zero component sets and final values are materially equivalent, so a zero balance does not create false ambiguity. More than one materially different closing formula is `ambiguous`, never a false confirmation.

## Mandatory due

1. A candidate explicitly including optional charges cannot be automatically confirmed.
2. One unambiguously reconciled printed candidate that excludes optional charges may be confirmed, including when other printed candidates do not close E2.
3. Multiple candidates, an open equation, or unknown optional semantics require review.
4. If only an optional-inclusive total is printed, an amount computed without optional charges is review-only.
5. If no total is printed but the document formula can be computed, it is returned as `mandatoryDue=needs_review` with source `computed`, not as absent.
6. Printed zero and negative values are valid and retain their signs.

## Draft decision

The core rejects a confirmed `other` document, a wholly unreadable document, or a document with neither period nor monetary data. A confirmed `utility` follows the normal draft rules. An `unknown` document with a period or amount becomes a review-only partial draft instead of being rejected. A `partial_draft` does not enter a monthly total and cannot become a payment without owner confirmation.

## Safe diagnostics

Public diagnostics contain only structural IDs, enum roles, hashes, states, equation deltas, and error codes. They exclude literal text, addresses, names, account numbers, document images, and provider payloads. A separate caller may retain the literal document inside an approved private boundary; this core never logs it.

## Non-goals

- vision/OCR/model calls or prompts;
- QR decoding;
- Telegram, UI, persistence, migrations, RLS, or Storage;
- provider-specific templates;
- current Production integration;
- repair of pending Telegram actions.
