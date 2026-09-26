# Receipt vision/OCR spike

Status: prepared offline on 2026-09-26. Provider execution is blocked until the owner separately approves the published call and cost estimate.

The machine-readable prepaid gate report is [receipt-vision-spike-gate-4a4d411.json](./reports/receipt-vision-spike-gate-4a4d411.json).

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
| R2 | Cloud layout parser | Google Document AI Enterprise OCR `pretrained-ocr-v2.1-2024-08-07` |
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
| R2 x C1, clean and Telegram photo | 20 files / 22 documents | 1 | 20 | 20 |
| R3 x C1, digital PDF | 10 files / 11 documents | 1 | 0 | 10 |
| Saved R1 output x C2 | 20 files / 22 documents | 3 | 0 | 60 |

R1 output is persisted and reused for the C2 comparison. No image classifier or OCR-plus-LLM hybrid is in this matrix; such a test needs a localized failure that it could address.

## Metrics and gates

Reader scoring separates literal content from positioning. Text and numeric precision/recall use multisets independent of positional IDs; row/column binding and geometry are scored separately. Classifier scoring uses role, named-slot, monetary-role, and segmentation sets. End-to-end scoring runs the deterministic core and records decision stability, false rejects, and silent critical errors.

Go thresholds:

- zero silent critical errors in a `confirmed_draft`;
- zero values filled into cells marked `blank` or `illegible`;
- numeric recall at least 99% for clean images and 97% after Telegram transformation;
- row/column binding accuracy at least 98%;
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
```

PDF regeneration additionally requires the pinned Playwright Chromium installation and is not needed for normal evaluator runs.

## Prepaid gate

The current upper estimate is generated by `npm run receipt:spike:plan`. It deliberately ignores any Google free tier and applies a 1.5x safety multiplier to proxy token counts. The estimate is a budget ceiling, not measured cost.

The full matrix is estimated at **$11.9983**: oracle C1 $1.7580, oracle C2 $0.0879, R1 x C1 $8.1887, R2 x C1 $1.2019, R3 x C1 $0.5860, and saved R1 x C2 $0.1758. It contains 270 OpenAI calls, 20 Google Document AI calls, and 10 local PDF extractions. All provider cells remain `planned_not_run`.

No provider client is invoked by the dry run. Paid execution, credentials, and cloud-resource changes require a separate owner approval after review of the committed gate report. The initial estimate also indicates that the upper-bound R1+C1 document-run may exceed the $0.10 target; actual usage must be measured before that configuration can pass the cost gate.

## Limits

- No paid provider result exists yet, so quality, stability, latency, and actual cost are not measured.
- R2 credentials and processor access are intentionally not configured by this PR.
- The digital PDF adapter extracts the text layer and approximate row geometry; it does not attempt table semantics.
- This code is evaluator-only and is not imported by Telegram, receipt runtime routes, or Production configuration.
