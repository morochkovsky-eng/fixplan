# Receipt error attribution: 2026-09-24

This is a sanitized attribution of every mismatch in the 42-run baseline recorded in [RECEIPT_EVAL_20260924.md](./RECEIPT_EVAL_20260924.md). T05 is excluded.

## Evidence limit

The baseline persisted critical values, counts, model IDs, usage and latency, but deliberately did not persist literal transcription, complete normalized entities or `sourceRegionIds`. Therefore `sourceRegionIds` and exact first-stage attribution are marked `not persisted` unless the retained provider failure proves the stage. This limitation must not be filled with guesses. A new private diagnostic mode can persist those artifacts in a mode-`0600` file outside Git; its first call was rejected by the API with HTTP 429, so no replacement evidence was available for this revision.

Visual inspection of the private source documents establishes whether the relevant printed content exists. It does not reconstruct a discarded model transcription.

## Run-level attribution

`N output` means the earliest retained error is the normalized receipt. `Unknown V/N` means the baseline cannot distinguish visual transcription from normalization.

| Document | Model | Run | Expected | Actual | First retained stage | Region IDs | Printed on image | In transcription | Repeats | Cause |
|---|---|---:|---|---|---|---|---|---|---|---|
| T02 | Terra | 1 | debt 0; payment 0 | both null | N output | not persisted | zero balance semantics present | not persisted | debt 3/3, payment 2/3 | `missing_field` |
| T02 | Terra | 2 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T02 | Terra | 3 | debt 0; payment 0 | both null | N output | not persisted | yes | not persisted | debt 3/3, payment 2/3 | `missing_field` |
| T02 | GPT-5.5 | 1 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T02 | GPT-5.5 | 2 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T02 | GPT-5.5 | 3 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T03 | Terra | 1 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T03 | Terra | 1 | 2 charge rows | 4 charge rows | Unknown V/N | not persisted | extra candidates are printed balance rows, not services | not persisted | 3/3 | `semantic_misclassification` |
| T03 | Terra | 2 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T03 | Terra | 2 | 2 charge rows | 4 charge rows | Unknown V/N | not persisted | same printed balance rows | not persisted | 3/3 | `semantic_misclassification` |
| T03 | Terra | 3 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T03 | Terra | 3 | 2 charge rows | 4 charge rows | Unknown V/N | not persisted | same printed balance rows | not persisted | 3/3 | `semantic_misclassification` |
| T03 | GPT-5.5 | 3 | debt 0 | null | N output | not persisted | yes | not persisted | 1/3 | `missing_field` |
| T04 | Terra | 1 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T04 | Terra | 2 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T04 | Terra | 3 | debt 0 | null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T04 | Terra | 3 | no meters | 1 meter | Unknown V/N | not persisted | reference/normative row exists, individual meter does not | not persisted | 1/3 | `semantic_misclassification` |
| T04 | GPT-5.5 | 1 | debt 0; no meters | debt null; 1 meter | Unknown V/N | not persisted | same reference row | not persisted | meter 3/3 | `missing_field`; `semantic_misclassification` |
| T04 | GPT-5.5 | 2 | debt 0; no meters | debt null; 1 meter | Unknown V/N | not persisted | same reference row | not persisted | meter 3/3 | `missing_field`; `semantic_misclassification` |
| T04 | GPT-5.5 | 3 | debt 0; no meters/options | debt null; 1 meter; 2 options | Unknown V/N | not persisted | reference content exists, those entities do not | not persisted | meter 3/3, options 1/3 | `missing_field`; `semantic_misclassification` |
| T06 | Terra | 1 | advance/payment/recalc/penalty 0 | all null | N output | not persisted | zero columns are printed | not persisted | 3/3 | `missing_field` |
| T06 | Terra | 2 | advance/payment/recalc/penalty 0 | all null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T06 | Terra | 3 | advance/payment/recalc/penalty 0 | all null | N output | not persisted | yes | not persisted | 3/3 | `missing_field` |
| T06 | GPT-5.5 | 1 | four zeros; no option | nulls; 1 option | Unknown V/N | not persisted | zero columns printed; option unsupported | not persisted | 3/3 | `missing_field`; `semantic_misclassification` |
| T06 | GPT-5.5 | 2 | four zeros; no option | nulls; 1 option | Unknown V/N | not persisted | same | not persisted | 3/3 | `missing_field`; `semantic_misclassification` |
| T06 | GPT-5.5 | 3 | housing; four zeros; no option | other; nulls; 1 option | Unknown V/N | not persisted | housing structure and zero columns printed | not persisted | type 1/3, option 3/3 | `semantic_misclassification`; `missing_field` |
| T07 | Terra | 2 | due 2026-09-25 | null | Unknown V/N | not persisted | literal date is clearly printed | not persisted | 1/3 | `missing_field` |
| T08 | Terra | 1 | debt 7559021; payment 7500000; advance 0 | all null | N output | not persisted | debt and payment are literal | not persisted | debt/payment 1/3; zero 3/3 | `financial_role_error`; `missing_field` |
| T08 | Terra | 2 | advance 0 | null | N output | not persisted | zero/absence semantics | not persisted | 3/3 | `missing_field` |
| T08 | Terra | 3 | advance 0; printed due 1499584 | null; printed due 1440563 | N output | not persisted | both accrual and due are printed separately | not persisted | due confusion 1/3 | `financial_role_error`; `missing_field` |
| T08 | GPT-5.5 | 1 | 22 rows; no extras; advance 0 | 21 matched + 1 wrong row; advance null | Unknown V/N | not persisted | source table has 22 rows | not persisted | 1/3 | `semantic_misclassification`; `missing_field` |
| T08 | GPT-5.5 | 2 | complete receipt | no normalized receipt | normalization | n/a | yes | transcription succeeded | 2/3 | `serialization_failure` |
| T08 | GPT-5.5 | 3 | complete receipt | no normalized receipt | normalization | n/a | yes | transcription succeeded | 2/3 | `serialization_failure` |

T01 had no retained mismatch in any of its six runs.

## Seven Terra extras

All seven are accounted for:

1. T03 Terra run 1, balance row A classified as a charge.
2. T03 Terra run 1, balance row B classified as a charge.
3. T03 Terra run 2, balance row A classified as a charge.
4. T03 Terra run 2, balance row B classified as a charge.
5. T03 Terra run 3, balance row A classified as a charge.
6. T03 Terra run 3, balance row B classified as a charge.
7. T04 Terra run 3, a reference/normative electricity row classified as an individual meter.

The exact normalized labels, numeric values and source IDs of these seven entities were not retained. The source pages show the candidate text, so the evidence supports `semantic_misclassification`, not a claim of `visual_hallucination`. T03 is systematic. T04 is stochastic entity classification, but the source content itself is real; a second visual transcription would not by itself prove that it is a meter.

## T08 balance detail

- Terra run 1 loses the printed opening debt and current payment and does not represent the zero advance. This is a role-extraction failure in the normalized output, not an arithmetic correction.
- Terra run 2 retains debt, current payment, recalculation and penalty, but leaves zero advance null.
- Terra run 3 retains the signed balance components but maps the accrual to `printedMandatoryDue`; the independently normalized `mandatoryDue` remains correct. This is a `financial_role_error`.
- GPT-5.5 run 1 misses one expected service amount and adds a different charge entity.
- GPT-5.5 runs 2 and 3 fail JSON serialization during normalization, so no downstream field attribution is possible.

## Architecture decision

The demonstrated Terra extras are classification errors over real printed content. The selected precision mechanism is therefore deterministic evidence verification, not dual-model voting:

- a flat literal evidence graph with page, bbox, visual kind and section type;
- exact source-region membership for every non-null value;
- section-aware rejection of headings, totals, normatives and reference rows;
- single-owner use of non-composite regions across child entities;
- separate printed financial components and document-specific reconciliation;
- targeted due-date recovery without a full second document interpretation.

Parallel Terra consensus remains an offline experiment, not Production behavior. It cannot repair a systematic T03 classification and was not benchmarked because the diagnostic API call returned HTTP 429.

No Google Document AI or Azure Document Intelligence credentials were present in the isolated evaluation environment. A cloud OCR spike was therefore not started. The current errors do not yet prove a missing-token OCR problem; they prove semantic classification errors. A future read-only spike would require a private Google project/location/processor credential or a private Azure endpoint/key, with raw OCR responses kept outside Git.
