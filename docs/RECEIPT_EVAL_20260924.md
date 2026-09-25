# Receipt pipeline offline evaluation: 2026-09-24

This report is a sanitized, read-only evaluation of PR #9. The source documents and gold data stayed outside the repository. Gold values were used only after each model response was complete and were never included in model prompts or context. T05 was excluded.

## Decision

No evaluated configuration meets the Production acceptance gate. `gpt-5.6-terra` is the better candidate for further architecture work, but it is **not approved for Production** by this evaluation. `gpt-5.5-2026-04-23` remains the pinned accuracy baseline.

The general fixes added after evaluation are limited to canonical date/period schemas, distinct provider failure codes, and a sanitized incremental evaluator. They do not encode fixture-specific values.

## T06 model benchmark

The benchmark used the exact Telegram-downloaded T06 image. `response.model` is shown in the final column.

| Requested model | Run | Critical fields | Charge rows | Meters | Blank current readings | Fallback | Latency, s | Cost, USD | `response.model` |
|---|---:|---|---:|---:|---|---|---:|---:|---|
| `gpt-5.6-luna` | 1 | correct | 19/19 | 4/4 | correct | no | 86.3 | 0.0197 | `gpt-5.6-luna` |
| `gpt-5.6-luna` | 2 | correct | 19/19 | 4/4 | correct | no | 88.9 | 0.0198 | `gpt-5.6-luna` |
| `gpt-5.6-luna` | 3 | correct | 19/19 | 4/4 | **incorrect** | no | 75.9 | 0.0179 | `gpt-5.6-luna` |
| `gpt-5.6-terra` | 1 | correct | 19/19 | 4/4 | correct | no | 127.6 | 0.1822 | `gpt-5.6-terra` |
| `gpt-5.6-terra` | 2 | correct | 19/19 | 4/4 | correct | no | 134.9 | 0.1791 | `gpt-5.6-terra` |
| `gpt-5.6-terra` | 3 | correct | 19/19 | 4/4 | correct | no | 127.3 | 0.1753 | `gpt-5.6-terra` |
| `gpt-5.5-2026-04-23` | 1 | correct | 19/19 | 4/4 | correct | no | 128.1 | 0.5964 | `gpt-5.5-2026-04-23` |
| `gpt-5.5-2026-04-23` | 2 | correct | 19/19 | 4/4 | correct | no | 135.5 | 0.6165 | `gpt-5.5-2026-04-23` |
| `gpt-5.5-2026-04-23` | 3 | correct | 19/19 | 4/4 | correct | no | 137.5 | 0.5939 | `gpt-5.5-2026-04-23` |

Luna failed the stability rule because one run filled at least one visually blank current-reading field. Terra therefore became the full-eval candidate. The two earlier exploratory Luna runs did not persist sanitized field-level output; the three complete reruns above replace them and record quality, usage, latency, cost, and actual response model.

## Full offline evaluation

Legend:

- `Y`, `N`, `-`: exact, incorrect, or not applicable.
- `Balances`: debt / advance / current payment / historical payment amount / historical payment date / recalculation / penalty.
- `Extra`: extra charge rows, optional charges, or meters beyond the gold document.
- Costs use the published model rates checked on 2026-09-24 for [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), and [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5), and include every transcription, normalization, and fallback call.

| Case | Model | Run | Pipeline | Type | Period | Accrued | Due | Due date | Balances | Lines | Meters | Extra | Fallback | Latency, s | Cost, USD |
|---|---|---:|---|---|---|---|---|---|---|---:|---:|---:|---|---:|---:|
| T01 | Terra | 1 | Y | Y | Y | Y | Y | Y | YY----- | 3/3 | 2/2 | 0 | N | 81.9 | 0.1130 |
| T01 | Terra | 2 | Y | Y | Y | Y | Y | Y | YY----- | 3/3 | 2/2 | 0 | N | 70.9 | 0.1086 |
| T01 | Terra | 3 | Y | Y | Y | Y | Y | Y | YY----- | 3/3 | 2/2 | 0 | N | 69.2 | 0.1211 |
| T01 | GPT-5.5 | 1 | Y | Y | Y | Y | Y | Y | YY----- | 3/3 | 2/2 | 0 | N | 81.9 | 0.3811 |
| T01 | GPT-5.5 | 2 | Y | Y | Y | Y | Y | Y | YY----- | 3/3 | 2/2 | 0 | N | 85.7 | 0.3903 |
| T01 | GPT-5.5 | 3 | Y | Y | Y | Y | Y | Y | YY----- | 3/3 | 2/2 | 0 | N | 83.2 | 0.3800 |
| T02 | Terra | 1 | Y | Y | Y | Y | Y | Y | NYN--YY | 1/1 | 0/0 | 0 | Y | 67.9 | 0.1131 |
| T02 | Terra | 2 | Y | Y | Y | Y | Y | Y | NYY--YY | 1/1 | 0/0 | 0 | N | 66.7 | 0.1031 |
| T02 | Terra | 3 | Y | Y | Y | Y | Y | Y | NYN--YY | 1/1 | 0/0 | 0 | N | 54.0 | 0.0936 |
| T02 | GPT-5.5 | 1 | Y | Y | Y | Y | Y | Y | NYY--YY | 1/1 | 0/0 | 0 | N | 60.6 | 0.2855 |
| T02 | GPT-5.5 | 2 | Y | Y | Y | Y | Y | Y | NYY--YY | 1/1 | 0/0 | 0 | N | 69.6 | 0.3152 |
| T02 | GPT-5.5 | 3 | Y | Y | Y | Y | Y | Y | NYY--YY | 1/1 | 0/0 | 0 | N | 69.6 | 0.3110 |
| T03 | Terra | 1 | Y | Y | Y | Y | Y | Y | NY-YY-- | 2/2 | 1/1 | 2 | N | 64.9 | 0.1098 |
| T03 | Terra | 2 | Y | Y | Y | Y | Y | Y | NY-YY-- | 2/2 | 1/1 | 2 | N | 91.3 | 0.1471 |
| T03 | Terra | 3 | Y | Y | Y | Y | Y | Y | NY-YY-- | 2/2 | 1/1 | 2 | Y | 109.6 | 0.1797 |
| T03 | GPT-5.5 | 1 | Y | Y | Y | Y | Y | Y | YY-YY-- | 2/2 | 1/1 | 0 | Y | 120.4 | 0.5264 |
| T03 | GPT-5.5 | 2 | Y | Y | Y | Y | Y | Y | YY-YY-- | 2/2 | 1/1 | 0 | N | 86.6 | 0.3952 |
| T03 | GPT-5.5 | 3 | Y | Y | Y | Y | Y | Y | NY-YY-- | 2/2 | 1/1 | 0 | N | 95.5 | 0.4283 |
| T04 | Terra | 1 | Y | Y | Y | Y | Y | Y | NY----- | 4/4 | 0/0 | 0 | N | 87.8 | 0.1384 |
| T04 | Terra | 2 | Y | Y | Y | Y | Y | Y | NY----- | 4/4 | 0/0 | 0 | N | 82.8 | 0.1347 |
| T04 | Terra | 3 | Y | Y | Y | Y | Y | Y | NY----- | 4/4 | 1/0 | 1 | N | 83.2 | 0.1265 |
| T04 | GPT-5.5 | 1 | Y | Y | Y | Y | Y | Y | NY----- | 4/4 | 1/0 | 1 | N | 99.0 | 0.4286 |
| T04 | GPT-5.5 | 2 | Y | Y | Y | Y | Y | Y | NY----- | 4/4 | 1/0 | 1 | N | 81.2 | 0.3906 |
| T04 | GPT-5.5 | 3 | Y | Y | Y | Y | Y | Y | NY----- | 4/4 | 1/0 | 3 | N | 107.2 | 0.4782 |
| T06 | Terra | 1 | Y | Y | Y | Y | Y | Y | YNNYYNN | 19/19 | 4/4 | 0 | N | 108.4 | 0.1931 |
| T06 | Terra | 2 | Y | Y | Y | Y | Y | Y | YNNYYNN | 19/19 | 4/4 | 0 | N | 108.4 | 0.1976 |
| T06 | Terra | 3 | Y | Y | Y | Y | Y | Y | YNNYYNN | 19/19 | 4/4 | 0 | N | 109.6 | 0.1842 |
| T06 | GPT-5.5 | 1 | Y | Y | Y | Y | Y | Y | YNNYYNN | 19/19 | 4/4 | 1 | Y | 157.6 | 0.7132 |
| T06 | GPT-5.5 | 2 | Y | Y | Y | Y | Y | Y | YNNYYNN | 19/19 | 4/4 | 1 | Y | 161.7 | 0.7385 |
| T06 | GPT-5.5 | 3 | Y | N | Y | Y | Y | Y | YNNYYNN | 19/19 | 4/4 | 1 | Y | 135.3 | 0.6438 |
| T07 | Terra | 1 | Y | Y | Y | Y | Y | Y | Y--YY-- | 1/1 | 0/0 | 0 | N | 52.0 | 0.0695 |
| T07 | Terra | 2 | Y | Y | Y | Y | Y | **N** | Y--YY-- | 1/1 | 0/0 | 0 | Y | 60.1 | 0.0955 |
| T07 | Terra | 3 | Y | Y | Y | Y | Y | Y | Y--YY-- | 1/1 | 0/0 | 0 | N | 31.6 | 0.0569 |
| T07 | GPT-5.5 | 1 | Y | Y | Y | Y | Y | Y | Y--YY-- | 1/1 | 0/0 | 0 | Y | 80.5 | 0.3267 |
| T07 | GPT-5.5 | 2 | Y | Y | Y | Y | Y | Y | Y--YY-- | 1/1 | 0/0 | 0 | N | 48.2 | 0.1981 |
| T07 | GPT-5.5 | 3 | Y | Y | Y | Y | Y | Y | Y--YY-- | 1/1 | 0/0 | 0 | N | 39.2 | 0.1768 |
| T08 | Terra | 1 | Y | Y | Y | Y | Y | Y | NNNYYYY | 22/22 | 4/4 | 0 | Y | 159.9 | 0.3006 |
| T08 | Terra | 2 | Y | Y | Y | Y | Y | Y | YNYYYYY | 22/22 | 4/4 | 0 | Y | 136.6 | 0.2769 |
| T08 | Terra | 3 | Y | Y | Y | Y | Y | Y | YNYYYYY | 22/22 | 4/4 | 0 | N | 109.5 | 0.2323 |
| T08 | GPT-5.5 | 1 | Y | Y | Y | Y | Y | Y | YNYYYYY | 21/22 | 4/4 | 1 | N | 131.2 | 0.7072 |
| T08 | GPT-5.5 | 2 | **N** | N | N | N | N | N | NNNNNNN | 0/22 | 0/4 | 0 | N | 136.8 | 0.3287 |
| T08 | GPT-5.5 | 3 | **N** | N | N | N | N | N | NNNNNNN | 0/22 | 0/4 | 0 | N | 137.0 | 0.3423 |

The two GPT-5.5 T08 failures were normalization `invalid_json` failures after successful transcription. The original failure path retained the requested model but discarded the normalization response's model and usage; PR #9 now preserves both on malformed JSON. A post-fix proof rerun was rate-limited with HTTP 429 and is not counted in the table. Terra T08 run 1 omitted debt and current payment; run 3 normalized the printed-due evidence incorrectly even though the final mandatory amount was correct. Terra T07 run 2 omitted a printed due date. Terra T03 produced two extra charge rows in every run. Both models sometimes converted non-meter content into a meter or voluntary charge.

## Aggregate acceptance

| Metric | Terra | GPT-5.5 | Required |
|---|---:|---:|---:|
| Successful pipelines | 21/21 | 19/21 | 21/21 |
| Correct periods | 21/21 | 19/21 | 21/21 |
| Correct accruals | 21/21 | 19/21 | 21/21 |
| Correct mandatory totals | 21/21 | 19/21 | 21/21 |
| Correct printed due dates when present | 14/15 | 13/15 | 15/15 |
| Expected numeric charge rows | 156/156 | 111/156 | >=95% |
| Expected meters | 33/33 | 25/33 | >=95% |
| Extra rows/meters/optional charges | 7 | 9 | 0 |
| False rejections | 0 | 2 | 0 |
| Stable across all three runs | no | no | yes |

Terra's expected-row recall is 100%, but precision is 156/163 (95.7%) because of seven invented structural elements. It therefore fails the explicit zero-hallucination rule. Balance classification is also unstable: Terra missed T08 debt/payment in one run and frequently returned `null` where the gold record expected an explicit zero. No evaluated model can be selected for Production solely by changing model IDs.

## Cost and latency

Recorded API cost in this report is **$14.3818**: **$11.9810** for the 42-run full corpus and **$2.4008** for the separate nine-run T06 model benchmark. This excludes earlier exploratory diagnostics that did not enter the retained benchmark tables.

Terra evaluation results:

| Scenario | Samples | Average cost | p50 cost | Max cost | p50 latency | Max latency |
|---|---:|---:|---:|---:|---:|---:|
| No fallback | 16 | $0.1331 | $0.1211 | $0.2323 | 81.9 s | 109.6 s |
| One fallback | 5 | $0.1932 | $0.1797 | $0.3006 | 109.6 s | 159.9 s |
| PDF | 15 | $0.1532 | $0.1265 | $0.3006 | 82.8 s | 159.9 s |
| Whole corpus | 21 | $0.1474 | - | $0.3006 | 82.8 s | 159.9 s |

At the observed corpus average, ten documents per apartment cost about $1.47/month. That projects to about $147/month for 100 active apartments, $1,474/month for 1,000, and $14,739/month for 10,000, before retries outside this pipeline, storage, or other assistant traffic.

Each provider request has a 240-second timeout. Two ordinary stages therefore have a theoretical 480-second ceiling and four fallback stages a 960-second ceiling, while the webhook/worker routes have `maxDuration = 300`. Observed runs fit the route budget, but the theoretical worst case does not. A shared pipeline deadline and cancellation budget are required before Production release.

## Model configuration

- `OPENAI_RECEIPT_TRANSCRIPTION_MODEL` and `OPENAI_RECEIPT_NORMALIZATION_MODEL` configure the stages independently without a code change.
- Field-level fallback uses the same configured transcription and normalization IDs as the primary pass.
- The committed fallback for both variables is the pinned `gpt-5.5-2026-04-23`; deployment without the new variables does not fall back to `gpt-5.4-nano` for receipts.
- `gpt-5.6-luna` and `gpt-5.6-terra` are floating aliases. The API returned those exact aliases in `response.model` during this evaluation.
- `OPENAI_MODEL`, whose existing default is `gpt-5.4-nano`, remains the general Telegram assistant model and is outside the receipt pipeline.
- No Production environment variables were changed during evaluation.

## Migration dry-run

The additive migration was applied to an isolated temporary Postgres-compatible database, not Production.

- Existing rows received `{}` and `[]` JSONB defaults; nullable historical-payment fields stayed null.
- `last_payment_minor` is `bigint`; `last_payment_date` is `date`.
- A partial draft could be inserted and updated.
- Owner-scoped RLS exposed only the owner's row; a foreign insert was rejected.
- The migration adds no table, policy, grant, trigger, function, `SECURITY DEFINER`, backfill, or destructive statement. Existing `utility_bills` owner/member policies continue to govern the new columns.
- Dropping the four additive columns restored the pre-migration shape in the isolated environment.
- No relevant breaking change was found in the current Supabase changelog for additive JSONB, bigint, or date columns.

## Privacy and traces

Runtime receipt traces contain update ID, stage, provider/model ID, usage, latency, quality metrics, fallback state, and anonymized failure codes. They do not contain image/base64 bytes, addresses, names, account numbers, complete transcription, literal evidence, Telegram tokens, or evidence JSON. Evidence and review state are persisted in the receipt row, not emitted to public logs.

The offline evaluator writes mode-`0600` incremental JSONL and deliberately omits provider text, address, account number, raw evidence, and source document bytes.

## Required architecture change

Changing the model is insufficient. The next iteration should add an independent evidence-verification stage that receives the literal region graph and proposed field paths, but not unverified semantic values as facts. It should:

1. Verify every critical amount/date and every proposed charge/meter/optional row against one or more literal regions.
2. Reject or mark review on unmatched rows rather than accepting structurally plausible additions.
3. Reconcile debt, advance, current payment, historical payment, recalculation, penalty, printed total, and mandatory total as separate signed concepts.
4. Use targeted page/region retries only for unresolved paths and retain a conflict instead of silently preferring either pass.
5. Enforce a shared request deadline below the 300-second route limit.

This is a general receipt architecture change, not a template rule for any evaluated document.

## Evidence-verification revision

PR #9 now implements the general architecture above:

- literal evidence regions carry page, normalized bounding box, visual kind, section type, literal label/value and composite-region intent;
- every non-null normalized fact must cite literal evidence;
- charge, meter and optional entities are removed from the confirmed set when their number is absent, their section is wrong, their source is a heading/total/reference row, or a non-composite region is reused;
- printed financial components preserve role, signed amount, whether they affect mandatory due and source evidence; validation reproduces the document-specific included-component formula;
- a missing due date gets one header-only targeted pass and remains reviewable when not recovered;
- one 240-second deadline covers all stages, with a 45-second minimum before any fallback and 60 seconds left for persistence/delivery inside the 300-second route limit;
- requested and returned model IDs are both retained in sanitized attempts/traces.

The run-level baseline attribution is in [`RECEIPT_ERROR_ATTRIBUTION_20260924.md`](RECEIPT_ERROR_ATTRIBUTION_20260924.md).

### Post-change evaluation status

The required Terra 21-run rerun is **not complete**. Two isolated diagnostic attempts on T03 were rejected before transcription with `http_429_credit_balance_exhausted`. No result from those calls is counted as an evaluation run. Until the private API project accepts inference again, precision, recall, post-change cost and post-change latency cannot be reported honestly and PR #9 remains ineligible for merge.

The previous measured Terra baseline remains the only empirical cost/latency basis: $0.1331 average without fallback, $0.1932 with one fallback, p50 82.8 seconds and max 159.9 seconds. The baseline visual transcription averaged $0.0683 with p50 45.0 seconds and max 73.6 seconds. A dual-transcription consensus would therefore add about $0.0683 per document before any consensus-normalization cost; parallel latency would depend on the slower visual call and was not measured. It was not enabled. The deterministic evidence verifier itself is local and does not add an API call.

The OpenAI model catalog and API both expose `gpt-5.6-terra` as the model ID. The Responses API returned the same alias, and the catalog currently exposes no distinct dated Terra snapshot to pin. This means alias drift cannot be inferred from `response.model` alone. The safe release policy is to retain requested/returned IDs, keep a fixed private canary corpus, and block adoption after any observed quality change; a truly reproducible dated target can be used only if OpenAI publishes a callable snapshot.

Google Document AI and Azure Document Intelligence credentials were absent from the isolated evaluation environment. No cloud OCR request was made. The seven Terra extras are attributable to semantic classification of real printed balance/reference content, not proven missing-token OCR, so an independent OCR provider is not required for this correction. If future evidence shows literal text hallucination, a read-only spike must use private Google processor or Azure endpoint credentials and keep source files and raw responses outside Git.
