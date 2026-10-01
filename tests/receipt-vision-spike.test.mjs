import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return nextResolve(specifier, context);
} });
await import("tsx/esm");
const adapters = await import("../lib/server/receipt-spike/adapters.ts");
const evaluator = await import("../lib/server/receipt-spike/evaluator.ts");

const root = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "spike-manifest.json"), "utf8"));
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("spike manifest pins every provider input and evaluator oracle", () => {
  assert.equal(manifest.sourcePackage.sha256, "2a1e28f08e477671a0e85c7e9dd0a1ca24b4712d255d8ccef6a09fd324b2e127");
  assert.equal(manifest.files.length, 10);
  assert.equal(manifest.documentCount, 11);
  for (const file of manifest.files) {
    for (const group of [file.inputs, file.evaluator]) for (const descriptor of Object.values(group)) {
      assert.equal(sha256(path.join(root, descriptor.path)), descriptor.sha256, descriptor.path);
    }
  }
});

test("reader boundary rejects IDs and semantic output", () => {
  const literal = readJson(manifest.files[0].evaluator.literal_source.path);
  assert.throws(() => adapters.parseVisionReaderOutput({ ...literal, documentKind: "utility" }), /forbidden keys/);
  const withId = structuredClone(literal);
  withId.pages[0].blocks[0].rows[0].cells[0].id = "model-owned";
  assert.throws(() => adapters.parseVisionReaderOutput(withId), /forbidden keys/);
});

test("vision reader infers one positional bbox format for the whole document or fails closed", () => {
  const literal = readJson(manifest.files[0].evaluator.literal_source.path);
  const input = structuredClone(literal);
  const block = input.pages[0].blocks[0];
  const cell = block.rows[0].cells[0];
  block.bbox = [0.783, 0.059, 0.947, 0.26];
  cell.bbox = [0.048, 0.052, 0.356, 0.077];
  const parsed = adapters.parseVisionReaderOutput(input);
  assert.deepEqual(parsed.pages[0].blocks[0].bbox, { x: 0.783, y: 0.059, width: 0.947 - 0.783, height: 0.26 - 0.059 });
  assert.deepEqual(parsed.pages[0].blocks[0].rows[0].cells[0].bbox, { x: 0.048, y: 0.052, width: 0.356 - 0.048, height: 0.077 - 0.052 });
  assert.deepEqual(cell.bbox, [0.048, 0.052, 0.356, 0.077]);

  const widths = structuredClone(input);
  widths.pages[0].blocks[0].bbox = [0.8, 0.1, 0.15, 0.2];
  assert.deepEqual(adapters.parseVisionReaderOutput(widths).pages[0].blocks[0].bbox, { x: 0.8, y: 0.1, width: 0.15, height: 0.2 });

  const ambiguous = structuredClone(literal);
  ambiguous.pages[0].blocks[0].rows[0].cells[0].bbox = [0.048, 0.052, 0.356, 0.077];
  assert.throws(() => adapters.parseVisionReaderOutput(ambiguous), (error) => error.code === "invalid_bbox" && /ambiguous/.test(error.message));
  const mixed = structuredClone(input);
  mixed.pages[0].blocks[0].rows[0].cells[0].bbox = [0.8, 0.1, 0.15, 0.2];
  assert.throws(() => adapters.parseVisionReaderOutput(mixed), (error) => error.code === "invalid_bbox");

  for (const bad of [[0.048, 0.052, 0.356], [0.048, 0.052, "0.356", 0.077], [0.8, 0.052, 0.356, 0.077], [-0.01, 0.052, 0.356, 0.077], [0.048, 0.052, 0.356, 0.077, 0]]) {
    const invalid = structuredClone(input);
    invalid.pages[0].blocks[0].rows[0].cells[0].bbox = bad;
    assert.throws(() => adapters.parseVisionReaderOutput(invalid), (error) => error.code === "invalid_bbox");
  }
});

test("offline R1 replay validates saved raw and never changes the ledger", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-r1-replay-"));
  const series = "r1-offline-replay";
  const runRoot = path.join(rootDir, series);
  const readerDir = path.join(runRoot, "r1-reader-clean-photo", "S01", "png_clean", "run-1", "reader");
  fs.mkdirSync(readerDir, { recursive: true });
  const ledgerFile = path.join(runRoot, "spend-ledger.jsonl");
  const ledger = `${JSON.stringify({ type: "completed", callId: "r1-reader-clean-photo:S01:png_clean:1:reader" })}\n`;
  fs.writeFileSync(ledgerFile, ledger);
  fs.writeFileSync(path.join(runRoot, "run.meta.json"), JSON.stringify({ series, integrity: { manifestSha256: sha256(path.join(root, "spike-manifest.json")) } }));
  const literal = readJson(manifest.files[0].evaluator.literal_source.path);
  const cell = literal.pages[0].blocks[0].rows[0].cells[0];
  literal.pages[0].blocks[0].bbox = [0.783, 0.059, 0.947, 0.26];
  cell.bbox = [cell.bbox.x, cell.bbox.y, cell.bbox.x + cell.bbox.width, cell.bbox.y + cell.bbox.height];
  const rawFile = path.join(readerDir, "response.raw.json");
  fs.writeFileSync(rawFile, JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(literal) }] }] }));
  const command = ["scripts/receipt-spike/replay-r1-s01.mjs", "--series", series, "--output-root", rootDir];
  const result = JSON.parse(execFileSync(process.execPath, command, { encoding: "utf8" }));
  assert.equal(result.contract, "valid");
  assert.equal(result.metrics.numericRecall, 1);
  assert.equal(result.metrics.blankCellsFilled, 0);
  assert.equal(fs.readFileSync(ledgerFile, "utf8"), ledger);

  cell.bbox = [0.9, 0.1, 0.2, 0.1];
  fs.writeFileSync(rawFile, JSON.stringify({ output_text: JSON.stringify(literal) }));
  const rejected = spawnSync(process.execPath, command, { encoding: "utf8" });
  assert.equal(rejected.status, 1);
  const invalid = JSON.parse(rejected.stdout);
  assert.equal(invalid.contract, "invalid");
  assert.equal(invalid.code, "invalid_bbox");
  assert.equal(fs.readFileSync(ledgerFile, "utf8"), ledger);
});

test("classifier boundary accepts only RoleClassification", () => {
  const semantic = readJson(manifest.files[0].evaluator.semantic.path);
  assert.doesNotThrow(() => adapters.parseClassifierOutput(semantic.roleClassification));
  assert.throws(() => adapters.parseClassifierOutput({ ...semantic.roleClassification, normalizedReceipt: {} }), /forbidden keys/);
});

test("indexed classifier input has a deterministic JSON wire representation", () => {
  const literal = readJson(manifest.files[0].evaluator.literal_source.path);
  const input = evaluator.prepareClassifierInput(manifest.files[0].fileId, literal);
  const wire = evaluator.stringifyClassifierInput(input);
  assert.doesNotThrow(() => JSON.parse(wire));
  assert.doesNotMatch(wire, /roleClassification|mandatoryDue|expected/);
  assert.match(wire, /"coefficient":"-?\d+"/);
});

test("classifier-owned document ID is aligned by rows for decision safety", () => {
  const file = manifest.files.find((item) => item.fileId === "S06");
  const semantic = readJson(file.evaluator.semantic.path);
  const literal = readJson(file.evaluator.literal_source.path);
  const classification = structuredClone(semantic.roleClassification);
  classification.documents[0].docId = "model-chosen-id";
  const result = evaluator.evaluateEndToEnd({
    fileId: "S06", variant: "oracle_literal", runNumber: 1,
    readerId: "oracle-reader", classifierId: "C1-openai-strong",
    readerInput: literal, classifierOutput: classification, semanticOracle: semantic,
  });
  assert.equal(result.decisions[0].docId, "S06-D1");
  assert.equal(result.decisions[0].producedDocId, "model-chosen-id");
  assert.equal(result.decisions[0].actual, "confirmed_draft");
  assert.equal(result.decisions[0].criticalFieldsMatch, true);
  assert.equal(result.documentAlignmentFailures, 0);
  assert.equal(result.unassessableConfirmedDocuments, 0);
});

test("confirmation when oracle expects review counts as a critical error", () => {
  const file = manifest.files.find((item) => item.fileId === "S06");
  const semantic = readJson(file.evaluator.semantic.path);
  semantic.documents[0].expected.decision = "partial_draft";
  const result = evaluator.evaluateEndToEnd({
    fileId: "S06", variant: "oracle_literal", runNumber: 1,
    readerId: "oracle-reader", classifierId: "C1-openai-strong",
    readerInput: readJson(file.evaluator.literal_source.path),
    classifierOutput: semantic.roleClassification, semanticOracle: semantic,
  });
  assert.equal(result.decisions[0].criticalFieldsMatch, true);
  assert.equal(result.decisions[0].actual, "confirmed_draft");
  assert.equal(result.silentCriticalErrors, 1);
});

test("split, merge and unpaired documents cannot be assessed as safe", () => {
  const gold = [
    { docId: "D1", documentKind: "utility", rowIds: ["r1", "r2"] },
    { docId: "D2", documentKind: "utility", rowIds: ["r3", "r4"] },
  ];
  const merged = evaluator.alignSpikeDocuments(gold, [{ docId: "merged", documentKind: "utility", rowIds: ["r1", "r2", "r3", "r4"] }]);
  assert.deepEqual(merged.matches, [null, null]);
  assert.deepEqual(merged.unmatchedProducedIndexes, [0]);
  const split = evaluator.alignSpikeDocuments(gold.slice(0, 1), [
    { docId: "a", documentKind: "utility", rowIds: ["r1"] },
    { docId: "b", documentKind: "utility", rowIds: ["r2"] },
  ]);
  assert.deepEqual(split.matches, [null]);
  assert.deepEqual(split.unmatchedProducedIndexes, [0, 1]);
  const partial = evaluator.alignSpikeDocuments(gold.slice(0, 1), [{ docId: "renamed", documentKind: "utility", rowIds: ["r1"] }]);
  assert.equal(partial.matches[0].rowCoverageMatch, false);
});

test("a merged S07 document is visible as an alignment failure", () => {
  const file = manifest.files.find((item) => item.fileId === "S07");
  const semantic = readJson(file.evaluator.semantic.path);
  const literal = readJson(file.evaluator.literal_source.path);
  const classification = structuredClone(semantic.roleClassification);
  classification.documents = [{
    docId: "merged", documentKind: "utility",
    rowIds: classification.documents.flatMap((document) => document.rowIds),
  }];
  const result = evaluator.evaluateEndToEnd({
    fileId: "S07", variant: "oracle_literal", runNumber: 1,
    readerId: "oracle-reader", classifierId: "C1-openai-strong",
    readerInput: literal, classifierOutput: classification, semanticOracle: semantic,
  });
  assert.deepEqual(result.decisions.map((decision) => decision.actual), [null, null]);
  assert.deepEqual(result.unmatchedProducedDocumentIds, ["merged"]);
  assert.ok(result.documentAlignmentFailures > 0);
});

test("offline oracle reevaluation uses saved classification and leaves ledger unchanged", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-reeval-"));
  const series = "offline-check";
  const runRoot = path.join(rootDir, series);
  fs.mkdirSync(runRoot, { recursive: true });
  const ledgerFile = path.join(runRoot, "spend-ledger.jsonl");
  fs.writeFileSync(ledgerFile, "ledger-placeholder\n");
  const manifestBytes = fs.readFileSync(path.join(root, "spike-manifest.json"));
  fs.writeFileSync(path.join(runRoot, "run.meta.json"), JSON.stringify({ integrity: { manifestSha256: createHash("sha256").update(manifestBytes).digest("hex") } }));
  const file = manifest.files.find((item) => item.fileId === "S06");
  const semantic = readJson(file.evaluator.semantic.path);
  const classification = structuredClone(semantic.roleClassification);
  classification.documents[0].docId = "model-chosen-id";
  const classificationFile = path.join(runRoot, "oracle-literal-c1", "S06", "oracle_literal", "run-1", "classifier", "classification.json");
  fs.mkdirSync(path.dirname(classificationFile), { recursive: true });
  fs.writeFileSync(classificationFile, JSON.stringify(classification));
  const before = fs.readFileSync(ledgerFile);
  const summary = JSON.parse(execFileSync(process.execPath, ["scripts/receipt-spike/reevaluate-oracle.mjs", "--series", series, "--output-root", rootDir], { encoding: "utf8" }));
  assert.equal(summary.cells[0].evaluations, 1);
  assert.equal(summary.cells[0].documentAlignmentFailures, 0);
  assert.equal(summary.cells[0].alignmentCases[0].decisions[0].producedDocId, "model-chosen-id");
  assert.deepEqual(fs.readFileSync(ledgerFile), before);
});

test("reader text and numeric completeness do not depend on positional IDs", () => {
  const literal = readJson(manifest.files[0].evaluator.literal_source.path);
  const shifted = structuredClone(literal);
  const rows = shifted.pages[0].blocks[0].rows;
  [rows[0], rows[1]] = [rows[1], rows[0]];
  const metrics = evaluator.evaluateReader(literal, shifted);
  assert.equal(metrics.textPrecision, 1);
  assert.equal(metrics.textRecall, 1);
  assert.equal(metrics.numericPrecision, 1);
  assert.equal(metrics.numericRecall, 1);
  assert.ok(metrics.rowColumnAccuracy < 1);
});

test("R2 document-token scoring is invariant to OCR merging multiple gold cells into one line", () => {
  const box = { x: 0, y: 0, width: 1, height: 1 };
  const expected = {
    readable: true,
    pages: [{ width: 100, height: 100, blocks: [{ layout: "table", bbox: box, rows: [{ cells: [
      { text: "Начислено", state: "ok", bbox: { x: 0, y: 0, width: 0.5, height: 1 } },
      { text: "1 234,56", state: "ok", bbox: { x: 0.5, y: 0, width: 0.5, height: 1 } },
    ] }] }] }],
  };
  const merged = {
    readable: true,
    pages: [{ width: 100, height: 100, blocks: [{ layout: "text", bbox: box, rows: [{ cells: [
      { text: "Начислено 1 234,56", state: "ok", bbox: box },
    ] }] }] }],
  };
  const cellMetrics = evaluator.evaluateReader(expected, merged);
  const r2Metrics = evaluator.evaluateReader(expected, merged, evaluator.readerEvaluationProfile("R2-google-enterprise-ocr"));
  assert.ok(cellMetrics.textRecall < 1);
  assert.equal(r2Metrics.textPrecision, 1);
  assert.equal(r2Metrics.textRecall, 1);
  assert.equal(r2Metrics.numericPrecision, 1);
  assert.equal(r2Metrics.numericRecall, 1);
  assert.equal(r2Metrics.textMetricGranularity, "document_token");
  assert.equal(r2Metrics.rowColumnAccuracy, null);
  assert.equal(r2Metrics.geometryAccuracy, null);
  assert.equal(r2Metrics.blankCellsFilled, null);
});

test("blank filling is measured while illegible filling remains explicitly untested", () => {
  const expected = { readable: true, pages: [{ width: 100, height: 100, blocks: [{ layout: "table", bbox: { x: 0, y: 0, width: 1, height: 1 }, rows: [{ cells: [{ text: "", state: "blank", bbox: { x: 0, y: 0, width: 1, height: 1 } }] }] }] }] };
  const actual = structuredClone(expected);
  actual.pages[0].blocks[0].rows[0].cells[0] = { ...actual.pages[0].blocks[0].rows[0].cells[0], text: "123", state: "ok" };
  const metrics = evaluator.evaluateReader(expected, actual);
  assert.equal(metrics.blankCellsFilled, 1);
  assert.equal(metrics.illegibleCellsFilled, null);
  assert.equal(metrics.illegibleMetricStatus, "not_tested_no_illegible_cells");
});

test("Google Enterprise OCR adapter consumes documented line geometry without assuming tables", () => {
  const layout = (startIndex, endIndex, x1, x2) => ({
    textAnchor: { textSegments: [{ startIndex: String(startIndex), endIndex: String(endIndex) }] },
    boundingPoly: { normalizedVertices: [{ x: x1, y: 0.1 }, { x: x2, y: 0.1 }, { x: x2, y: 0.2 }, { x: x1, y: 0.2 }] },
  });
  const adapted = adapters.adaptGoogleEnterpriseOcr({
    text: "Период\n09.2026\n",
    pages: [{
      dimension: { width: 1000, height: 1400 },
      lines: [{ layout: layout(0, 6, 0.1, 0.4) }, { layout: layout(7, 14, 0.1, 0.4) }],
      tables: [{ deliberately: "ignored because OCR does not guarantee table semantics" }],
    }],
  });
  assert.equal(adapted.pages[0].blocks.length, 1);
  assert.equal(adapted.pages[0].blocks[0].layout, "text");
  assert.deepEqual(adapted.pages[0].blocks[0].rows.map((row) => row.cells[0].text), ["Период", "09.2026"]);
  const metrics = evaluator.evaluateReader(
    readJson(manifest.files[0].evaluator.literal_source.path),
    adapted,
    evaluator.readerEvaluationProfile("R2-google-enterprise-ocr"),
  );
  assert.equal(metrics.textMetricGranularity, "document_token");
  assert.equal(metrics.rowColumnAccuracy, null);
  assert.equal(metrics.geometryAccuracy, null);
  assert.equal(metrics.blankCellsFilled, null);
  assert.equal(metrics.structureMetricStatus, "not_applicable_reader_has_no_table_contract");
  assert.equal(metrics.geometryMetricStatus, "not_applicable_reader_has_no_cell_geometry_contract");
});

test("digital PDF adapter returns literal text without semantic fields", async () => {
  const pdf = fs.readFileSync(path.join(root, manifest.files[0].inputs.pdf_digital.path));
  const visual = await adapters.adaptPdfTextLayer(pdf);
  assert.equal(visual.readable, true);
  assert.ok(visual.pages.flatMap((page) => page.blocks).length > 0);
  assert.doesNotMatch(JSON.stringify(visual), /documentKind|billingPeriod|mandatoryDue|roleClassification/);
});

test("provider requests reject evaluator-only paths", () => {
  assert.doesNotThrow(() => evaluator.assertNoEvaluatorLeak(["png_clean/S01.png", "photo_telegram/S01.jpg"]));
  for (const forbidden of ["oracle/literal_source/S01.json", "gold/S01.json", "reports/result.json"]) {
    assert.throws(() => evaluator.assertNoEvaluatorLeak([forbidden]), /evaluator_only_input_forbidden/);
  }
});

test("prepaid execution plan is complete but executes no provider calls", () => {
  const plan = JSON.parse(execFileSync(process.execPath, ["scripts/receipt-spike/plan.mjs"], { encoding: "utf8" }));
  assert.equal(plan.providerClientsInvoked, false);
  assert.equal(plan.paidCallsExecuted, 0);
  assert.equal(plan.totals.openAiCalls, 250);
  assert.equal(plan.totals.googleDocumentAiCalls, 0);
  assert.equal(plan.totals.providerCalls, 250);
  assert.ok(plan.totals.planningEstimateUsd > 0);
  assert.equal(plan.budget.maximumAuthorizedSpendUsd, 12);
  assert.equal(plan.budget.estimateIsGuaranteedCeiling, false);
  assert.equal(plan.gate.hardBudgetEnforcementRequired, true);
  assert.equal(plan.matrix.length, 5);
  assert.equal(plan.includeR2, false);
  assert.equal(plan.r2FollowUpPolicy.numericRecallMinimum.photo_telegram, 0.97);
  assert.ok(plan.matrix.every((entry) => entry.status === "planned_not_run"));
});
