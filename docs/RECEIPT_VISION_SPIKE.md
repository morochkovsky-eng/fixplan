# Receipt vision/OCR spike

Status: the initial no-R2 paid series stopped after one HTTP 400 classifier attempt. There were no completed calls, and the unchanged private ledger retains the $0.289683 reservation pending an independent billing audit. The provider error body was discarded by the old client, so the precise cause is not established. The follow-up implementation prepares a separate S10 canary and carries the old reservation into its $12 aggregate limit.

The current recovery report is [receipt-spike-http400-recovery-20260928.json](./reports/receipt-spike-http400-recovery-20260928.json). The [loader report](./reports/receipt-spike-loader-preflight-20260928.json), [approval series report](./reports/receipt-spike-approval-series-safety-20260927.json), [initial no-R2 report](./reports/receipt-spike-initial-no-r2-20260927.json), and [original preparation report](./reports/receipt-vision-spike-gate-d7acbe9.json) remain as historical snapshots with obsolete plan fingerprints.
The earlier runner reports [receipt-spike-runner-gate-c37ba31.json](./reports/receipt-spike-runner-gate-c37ba31.json) and [receipt-spike-runner-safety-4734c87.json](./reports/receipt-spike-runner-safety-4734c87.json) are retained as review history and superseded by [receipt-spike-runner-safety-e9ad55a.json](./reports/receipt-spike-runner-safety-e9ad55a.json).

This spike measures document reading and row classification independently before either is connected to the Homory runtime. The deterministic receipt core remains the final authority for parsing, arithmetic, reconciliation, and draft decisions. See [Receipt deterministic core](./RECEIPT_DETERMINISTIC_CORE.md).

## Data boundary

The committed evaluator uses only the synthetic `homory-synthetic-v1.1-rev2` corpus. Its archive hash and every committed input are pinned in `tests/fixtures/receipt-synthetic-v1.1/spike-manifest.json`.

- A reader receives only a PNG, JPEG, or PDF.
- A reader returns literal `VisualDocumentInput`: visible text, state, geometry, spans, and structure. It cannot return IDs or semantics.
- The server assigns stable positional IDs and numeric token IDs.
- A classifier receives only the indexed literal and structural features.
- A classifier returns only ID-based `RoleClassification`; it cannot return a normalized receipt.
- Literal, geometry, semantic oracles, legacy gold, manifests, and reports are evaluator-only and forbidden in provider requests.
- Semantic gold is never model context. It is read only after a run for scoring.

Raw provider outputs will be written below `.receipt-spike/runs/`, which is ignored by Git. The run record includes requested and returned model IDs, provider, prompt hash, adapter version, input SHA-256, raw output, usage, cost, and latency. A returned-model change starts a separate result series.

## Configurations

| ID | Purpose | Prepared configuration |
| --- | --- | --- |
| R1 | Strong vision literal reader | OpenAI `gpt-6-sol`, original image detail |
| R2 | Conditional cloud OCR baseline, excluded from the initial plan | Google Enterprise Document OCR `pretrained-ocr-v2.1-2024-08-07` |
| R3 | Digital PDF text layer | Local `pdfjs-dist@6.3.289` adapter |
| C1 | Strong text classifier | OpenAI `gpt-6-sol`, low reasoning |
| C2 | Economy text classifier | OpenAI `gpt-6-luna`, medium reasoning |

These are spike configurations, not Production settings. Requested and returned IDs are recorded separately; an alias resolution change cannot silently share a series.

## Matrix

| Cell | Inputs | Repeats | Reader calls | Classifier calls |
| --- | ---: | ---: | ---: | ---: |
| Oracle literal x C1 | 10 files / 11 documents | 3 | 0 | 30 |
| Oracle literal x C2 | 10 files / 11 documents | 3 | 0 | 30 |
| R1 x C1, clean and Telegram photo | 20 files / 22 documents | 3 | 60 | 60 |
| R3 x C1, digital PDF | 10 files / 11 documents | 1 | 0 | 10 |
| Saved R1 output x C2 | 20 files / 22 documents | 3 | 0 | 60 |

R1 output is persisted and reused for the C2 comparison. No image classifier or OCR-plus-LLM hybrid is in this matrix; such a test needs a localized failure that it could address. R2 remains available through the explicit `--include-r2` plan variant, which has a different plan SHA and requires its own approval and Google configuration. A later R2-only follow-up must be scoped separately to avoid repeating already paid calls.

### When to consider R2

The following thresholds are frozen in `r2FollowUpPolicy` inside the plan before any paid run. R2 is justified only after oracle literal x C1 passes its classifier gates and a failure is localized to the reader. Review R1 after at most two prompt revisions; do not tune repeatedly against this synthetic dev corpus.

- Numeric recall below 99% on `png_clean` or below 97% on `photo_telegram`.
- Any number invented by R1, or any filled gold-blank cell, especially the empty reading in S05 and blank form S09.
- Row/column accuracy below 98%, especially in the dense tables S04 and S09.
- Money-row numeric tokens differ across three R1 runs on the same input.
- R1 reader price exceeds $0.10 per document or p50 latency exceeds 45 seconds.
- An authorized future evaluation of real T03/T04/T08 shows substantially worse reader performance than synthetic data.

The real documents are not part of this committed synthetic corpus. The first five conditions can be assessed from the private evaluation and usage artifacts after the initial run; the money-row stability check requires comparison by row. These conditions do not automatically dispatch OCR. A later R2 experiment needs a separately reviewed plan and approval, and may first use a local OCR baseline on synthetic inputs.

## Metrics and gates

Reader scoring separates literal content from positioning. Cell-preserving readers use literal-cell multisets, while OCR/text-layer readers use document-token multisets so that a correct merged line is not penalized for crossing gold cell boundaries. Numeric precision/recall always use numeric-token multisets independent of positional IDs. Classifier scoring uses role, named-slot, monetary-role, and segmentation sets. End-to-end scoring runs the deterministic core and records decision stability, false rejects, and silent critical errors.

R2 deliberately consumes the documented Enterprise OCR `pages[].lines[]` plus line geometry and does not read `pages[].tables[]`. Its text score is calculated at document-token level and its numeric score at numeric-token level. OCR line geometry is retained in `VisualDocumentInput` for downstream experiments, but it is not compared with cell-level gold geometry: structure, geometry, and blank-cell metrics are marked not applicable. [Google Layout Parser](https://docs.cloud.google.com/document-ai/docs/layout-parse-chunk) is a different, more expensive product with a `DocumentLayout` response; it is not selected or mocked in this spike because its real response has not been validated against the adapter. The R2 response contract follows the documented [Enterprise Document OCR hierarchy](https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr).

Go thresholds:

- zero silent critical errors in a `confirmed_draft`;
- zero values filled into cells marked `blank` or `illegible` for readers that preserve the gold cell contract; this metric is not applicable to line-only R2;
- numeric recall at least 99% for clean images and 97% after Telegram transformation;
- row/column binding accuracy at least 98% for readers whose provider contract exposes table structure; R2 Enterprise OCR is explicitly not applicable;
- monetary-role accuracy at least 97% on oracle literal and 95% end to end;
- at least 70% of gold-confirmable documents become `confirmed_draft`;
- zero false rejects of utility documents;
- at least 90% decision agreement across three runs;
- no more than $0.10 per document, p50 no more than 45 seconds, and p95 no more than 120 seconds.

The corpus contains no `illegible` cells. The illegible-cell hallucination metric is therefore **not tested**, not passed.

The classifier approach is unsuitable if oracle-literal monetary-role accuracy is consistently below 95%, confirmability is below 50% at zero silent errors, or a reproducible silent critical error cannot be explained by a correctable contract/parser defect.

## PDF fixture

The ten digital PDFs are committed artifacts with SHA-256 values in the spike manifest. They were rendered from the synthetic HTML with Playwright `1.56.0`, Chromium `141.0.7390.37`, and `pdf-lib@1.17.1`; metadata is normalized after rendering. Chromium can still emit byte differences across regenerations despite pinned versions, so the committed PDF plus its manifest hash, rather than byte-identical regeneration, is the evaluator input of record.

## Offline commands

```bash
npm run receipt:spike:manifest
npm run receipt:spike:plan
npm run receipt:spike:dry-run
npm run receipt:spike:runner
```

PDF regeneration additionally requires the pinned Playwright Chromium installation and is not needed for normal evaluator runs.

## Prepaid gate

The current planning estimate is generated by `npm run receipt:spike:plan`. It deliberately ignores any Google free tier and applies a 1.5x safety multiplier to proxy token counts. It is not a guaranteed ceiling because proxy token counts can differ from provider billing. A paid runner must enforce a separate **$12.00 hard cap** and stop before starting a call whose reserved maximum could exceed it.

The strict-schema matrix now estimates **$11.5372** for 250 OpenAI calls, zero Google calls, and 10 local PDF extractions; a new S10 canary estimates **$0.0378** for one distinct call. Both estimates exclude the two held reservations totaling **$0.519391**. The combined planning estimate is **$12.094391**, above the $12 cap. This is an estimate, not a charge or a guaranteed ceiling. The full matrix may stop early; its scope and budget must be reconsidered after a successful canary, without increasing the approved cap by implication. A plan fingerprint depends on the exact hashes and committed amounts of all prior series ledgers and must be obtained locally with both `--prior-series` values; plan SHA values from previous code do not authorize execution.

No provider client is invoked by the dry run. Paid execution, credentials, and cloud-resource changes require a separate owner approval after review of the committed gate report. The initial estimate also indicates that the upper-bound R1+C1 document-run may exceed the $0.10 target; actual usage must be measured before that configuration can pass the cost gate.

## Matrix runner

`npm run receipt:spike:runner` is safe by default: it prints the exact plan SHA, call counts, and hard cap, constructs no provider clients, and executes no provider calls. Paid mode is deliberately unavailable without all of the following:

- `--execute`, a new safe series name, and an explicit approval file;
- an owner-only approval file with mode `600`, schema `receipt-spike-approval-v3`, a newly generated UUID v4 `approvalId`, the exact `series` name, the exact locally computed plan SHA, an unexpired timestamp, the exact hard cap of `12000000` micro-USD, and a `carryover` array copied verbatim from that plan;
- `OPENAI_API_KEY` in the local execution environment. The four Google variables are required only with `--include-r2`.

The repository contains no approved execution file and no credentials. Earlier approval-v1/v2 files cannot authorize this code. Approval-v3 is restricted to one series and includes every prior ledger's exact SHA and conservative committed amount. Repeating `--execute` with the same approval is a resume of that exact series and its ledger; another `--series`, a missing ledger, a changed ledger, or omission of an existing series fails closed. The prior series ledger must remain intact on the Mac. The first no-call plan and subsequent paid command have this shape:

```bash
npm run receipt:spike:plan -- --canary-only --prior-series initial-no-r2-20260928-01 --prior-series s10-canary-no-r2-20260928-01
npm run receipt:spike:runner -- \
  --execute --canary-only \
  --prior-series initial-no-r2-20260928-01 \
  --prior-series s10-canary-no-r2-20260928-01 \
  --series <new-canary-series-name> \
  --approval-file <owner-only-approval.json>
```

Run `--preflight-only` on the paid command first, without a key. The old S10 canary produced a completed response with valid usage but an invalid `tableSchemas[0].tableBlockId`. Its result was not scored and its old ledger still holds $0.229708. A new canary must use a distinct series and approval with both old series as carryover, test the strict `json_schema` wire format, and remain outside the matrix. It requires an HTTP 200 completed response, valid usage within the call reservation, a parsed `RoleClassification`, and no error-severity ID/schema/slot diagnostics. Meaning accuracy is measured by a subsequent matrix. Review the aggregate budget before scheduling that matrix.

`npm run receipt:spike:plan -- --include-r2` and `npm run receipt:spike:runner -- --include-r2` prepare the distinct full-matrix variant. Only that variant constructs a Google client and requires Google credentials.

For a no-call execution smoke after creating a valid approval-v3 file, run the same command with `--preflight-only`. It validates the approval, prior ledgers, modules, manifest, classifier contract and prompt bytes, then exits without requiring credentials, constructing clients, creating a series or contacting providers.

The classifier sends an explicit JSON instruction and a server-generated role/slot contract as a separate input part before the unchanged indexed literal. The contract is generated from receipt-core constants and required/allowed slot rules; its SHA and source bytes are bound to the plan. For HTTP failures, only safe status and classification information leaves the private series; `error.json` in the call directory retains a bounded message and request ID under mode 600. Definitive rejection and unknown outcomes remain held for manual audit; neither releases money automatically.

The runner is sequential and holds an exclusive filesystem lock for the full lifetime of a series. A second process cannot execute or reserve against that series. Ledger operations also acquire their own atomic lock and reload the append-only ledger from disk, so separate processes cannot spend from stale snapshots. The series metadata binds the approval ID and the ledger device/inode. Deleting or replacing that ledger blocks a resume; do not reset a spent approval by creating a new series.

Before the first provider call the runner verifies every manifest byte count and SHA-256, validates that evaluator-only paths are not reader inputs, and confirms the manifest model configuration. The approval fingerprint includes the exact manifest, reader prompt, classifier prompt, and safety-critical runner source hashes. The planner returns an unsigned plan; a separate approval module verifies the actual `plan-lib.mjs` bytes against the plan and independently computes the final fingerprint. Changing the planner therefore invalidates a stale plan and requires a new approval. A series stores that binding once and refuses to resume under a different plan.

OpenAI reservations are request-specific rather than fixed. The upper bound includes the exact serialized request byte length, a separate image-patch ceiling, protocol allowance, fixed `max_output_tokens`, the long-context multiplier above 272K input tokens, and the cache-write premium. R2 reserves `$0.01` for each pinned single-image OCR request. A call is stopped **before dispatch** when recorded spend plus its proven upper bound would exceed `$12.00`.

Returned usage, usage-derived list-price cost, a separate conservative budget charge, requested and returned model IDs, latency, sanitized request metadata, raw response, parsed result, classifier input, and evaluation are stored under the git-ignored `.receipt-spike/runs/<series>/` directory with owner-only permissions. OpenAI responses without finite token usage, and Google OCR responses without a positive page count, are not accepted as zero-cost successes. The ledger enforces the cap using the conservative budget charge, including the possible cache-write premium and long-context multiplier, while retaining the nominal usage-derived estimate for reporting. The append-only spend ledger is written before dispatch. A timeout, interrupted process, missing usage, missing artifact, or budget charge above reservation leaves an unresolved reservation and blocks every later call until a manual audit. For a completed OpenAI response with valid usage but invalid classifier output, the ledger records the known cost and stops the series; raw response and bounded contract error remain private. Completed valid calls are reused on restart and are never paid twice automatically.

R1 results from the C1 cell are reused byte-for-byte for the C2 cell. R3 remains local and does not enter the spend ledger. If a provider returns a different resolved model ID for the same requested alias, the paid call is recorded and the series stops; the new model must be evaluated under a separate series. The runner uses a 120-second abort signal per provider call and never falls back to an unlisted model.

## Limits

For a completed classifier refusal, or an incomplete classifier response with valid usage and model ID, the runner records the known charge before rejecting the output. It writes a private diagnostic code and no validated provider result. Without valid usage or model ID, the outcome remains reserved for manual audit.

- One completed S10 response exists, but its classification failed local contract validation; quality, stability, and end-to-end accuracy remain unmeasured. Its actual cost was not stored by the old runner.
- R2 credentials and processor access are intentionally not configured; the initial plan does not need them.
- R2 cannot establish cell geometry, blank-cell behavior, or table/column quality from the current line-only contract and oracle. A future Layout Parser comparison requires a separate adapter validated against an actual `DocumentLayout` response and a revised estimate.
- The digital PDF adapter extracts the text layer and approximate row geometry; it does not attempt table semantics.
- This code is evaluator-only and is not imported by Telegram, receipt runtime routes, or Production configuration.
