import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
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

test("blank filling is measured while illegible filling remains explicitly untested", () => {
  const expected = { readable: true, pages: [{ width: 100, height: 100, blocks: [{ layout: "table", bbox: { x: 0, y: 0, width: 1, height: 1 }, rows: [{ cells: [{ text: "", state: "blank", bbox: { x: 0, y: 0, width: 1, height: 1 } }] }] }] }] };
  const actual = structuredClone(expected);
  actual.pages[0].blocks[0].rows[0].cells[0] = { ...actual.pages[0].blocks[0].rows[0].cells[0], text: "123", state: "ok" };
  const metrics = evaluator.evaluateReader(expected, actual);
  assert.equal(metrics.blankCellsFilled, 1);
  assert.equal(metrics.illegibleCellsFilled, null);
  assert.equal(metrics.illegibleMetricStatus, "not_tested_no_illegible_cells");
});

test("Google layout adapter does not duplicate paragraphs inside table boxes", () => {
  const layout = (startIndex, endIndex, x1, x2) => ({
    textAnchor: { textSegments: [{ startIndex: String(startIndex), endIndex: String(endIndex) }] },
    boundingPoly: { normalizedVertices: [{ x: x1, y: 0.1 }, { x: x2, y: 0.1 }, { x: x2, y: 0.2 }, { x: x1, y: 0.2 }] },
  });
  const adapted = adapters.adaptGoogleDocumentAi({
    text: "Период\n09.2026\n",
    pages: [{
      dimension: { width: 1000, height: 1400 },
      tables: [{
        layout: { boundingPoly: { normalizedVertices: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.2 }, { x: 0.1, y: 0.2 }] } },
        headerRows: [],
        bodyRows: [{ cells: [{ layout: layout(0, 6, 0.1, 0.4) }, { layout: layout(7, 14, 0.4, 0.9) }] }],
      }],
      paragraphs: [{ layout: layout(0, 14, 0.1, 0.9) }],
    }],
  });
  assert.equal(adapted.pages[0].blocks.length, 1);
  assert.deepEqual(adapted.pages[0].blocks[0].rows[0].cells.map((cell) => cell.text), ["Период", "09.2026"]);
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
  assert.equal(plan.totals.openAiCalls, 270);
  assert.equal(plan.totals.googleDocumentAiCalls, 20);
  assert.equal(plan.totals.providerCalls, 290);
  assert.ok(plan.totals.upperEstimateUsd > 0);
  assert.equal(plan.matrix.length, 6);
  assert.ok(plan.matrix.every((entry) => entry.status === "planned_not_run"));
});
