import { createHash } from "node:crypto";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { execFileSync } from "node:child_process";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return nextResolve(specifier, context);
} });
await import("tsx/esm");
const spike = await import("../../lib/server/receipt-spike/evaluator.ts");
const adapters = await import("../../lib/server/receipt-spike/adapters.ts");

const root = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "spike-manifest.json"), "utf8"));
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const verified = [];

for (const file of manifest.files) for (const group of [file.inputs, file.evaluator]) for (const descriptor of Object.values(group)) {
  const absolute = path.join(root, descriptor.path);
  const actual = sha(absolute);
  if (actual !== descriptor.sha256) throw new Error(`manifest_sha_mismatch:${descriptor.path}`);
  verified.push(descriptor.path);
}

const readerChecks = [];
for (const file of manifest.files) for (const [variant, oracleKey] of [["png_clean", "literal_source"], ["photo_telegram", "literal_photo"]]) {
  const literal = readJson(path.join(root, file.evaluator[oracleKey].path));
  const parsed = adapters.parseVisionReaderOutput(literal);
  const metrics = spike.evaluateReader(literal, parsed);
  readerChecks.push({ fileId: file.fileId, variant, metrics });
}

const classifierChecks = [];
for (const file of manifest.files) {
  const literal = readJson(path.join(root, file.evaluator.literal_source.path));
  const semantic = readJson(path.join(root, file.evaluator.semantic.path));
  const classifierInput = spike.prepareClassifierInput(file.fileId, literal);
  const serializedInput = spike.stringifyClassifierInput(classifierInput);
  if (serializedInput.includes("roleClassification") || serializedInput.includes("mandatoryDue") || serializedInput.includes("expected")) {
    throw new Error(`classifier_input_oracle_leak:${file.fileId}`);
  }
  for (const classifierId of ["C1-openai-strong", "C2-openai-economy"]) for (let runNumber = 1; runNumber <= 3; runNumber += 1) {
    classifierChecks.push(spike.evaluateEndToEnd({
      fileId: file.fileId,
      variant: "oracle_literal",
      runNumber,
      readerId: "oracle-reader",
      classifierId,
      readerInput: literal,
      classifierOutput: semantic.roleClassification,
      semanticOracle: semantic,
    }));
  }
}

const pdfChecks = [];
for (const file of manifest.files) {
  const bytes = fs.readFileSync(path.join(root, file.inputs.pdf_digital.path));
  const visual = await adapters.adaptPdfTextLayer(bytes);
  const cells = visual.pages.flatMap((page) => page.blocks.flatMap((block) => block.rows.flatMap((row) => row.cells)));
  if (!visual.readable || cells.length === 0 || cells.every((cell) => !cell.text.trim())) throw new Error(`pdf_text_layer_empty:${file.fileId}`);
  pdfChecks.push({ fileId: file.fileId, pages: visual.pages.length, cells: cells.length, characters: cells.reduce((sum, cell) => sum + cell.text.length, 0) });
}

const googleMock = adapters.adaptGoogleEnterpriseOcr({
  text: "Период\n09.2026\n",
  pages: [{
    dimension: { width: 1000, height: 1400 },
    lines: [
      { layout: { textAnchor: { textSegments: [{ startIndex: "0", endIndex: "6" }] }, boundingPoly: { normalizedVertices: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.15 }, { x: 0.1, y: 0.15 }] } } },
      { layout: { textAnchor: { textSegments: [{ startIndex: "7", endIndex: "14" }] }, boundingPoly: { normalizedVertices: [{ x: 0.1, y: 0.16 }, { x: 0.4, y: 0.16 }, { x: 0.4, y: 0.2 }, { x: 0.1, y: 0.2 }] } } },
    ],
  }],
});
if (googleMock.pages[0].blocks[0].rows.map((row) => row.cells[0].text).join("|") !== "Период|09.2026") throw new Error("google_adapter_mock_failed");
const googleMetricContract = spike.evaluateReader(
  readJson(path.join(root, manifest.files[0].evaluator.literal_source.path)),
  googleMock,
  spike.readerEvaluationProfile("R2-google-enterprise-ocr"),
);
if (
  googleMetricContract.textMetricGranularity !== "document_token" || googleMetricContract.rowColumnAccuracy !== null ||
  googleMetricContract.geometryAccuracy !== null || googleMetricContract.blankCellsFilled !== null ||
  googleMetricContract.structureMetricStatus !== "not_applicable_reader_has_no_table_contract" ||
  googleMetricContract.geometryMetricStatus !== "not_applicable_reader_has_no_cell_geometry_contract"
) {
  throw new Error("google_ocr_cell_metrics_must_be_not_applicable");
}

spike.assertNoEvaluatorLeak(manifest.files.flatMap((file) => [file.inputs.png_clean.path, file.inputs.photo_telegram.path, file.inputs.pdf_digital.path]));
const costPlan = JSON.parse(execFileSync(process.execPath, ["scripts/receipt-spike/plan.mjs"], { encoding: "utf8" }));
const decisions = classifierChecks.flatMap((check) => check.decisions);
const report = {
  schemaVersion: "receipt-spike-dry-run-v1",
  baselineCommit: manifest.baselineCommit,
  implementationCommit: process.env.SPIKE_COMMIT ?? "working-tree",
  manifest: {
    path: "tests/fixtures/receipt-synthetic-v1.1/spike-manifest.json",
    verifiedFiles: verified.length,
    sourcePackageSha256: manifest.sourcePackage.sha256,
    inputFiles: manifest.inputFileCount,
    documents: manifest.documentCount,
  },
  isolation: {
    readerReceivesOnlyBinaryInput: true,
    classifierReceivesOnlyIndexedLiteral: true,
    evaluatorOnlyDataExcluded: true,
    legacyGoldUsed: false,
  },
  dryRun: {
    providerClientsInvoked: false,
    paidCallsExecuted: 0,
    readerOracleSelfChecks: readerChecks.length,
    readerOracleSelfChecksPerfect: readerChecks.filter(({ metrics }) =>
      metrics.textPrecision === 1 && metrics.textRecall === 1 && metrics.numericPrecision === 1 && metrics.numericRecall === 1 &&
      metrics.rowColumnAccuracy === 1 && metrics.geometryAccuracy === 1 && metrics.blankCellsFilled === 0
    ).length,
    classifierMockRuns: classifierChecks.length,
    classifierMockDocumentEvaluations: decisions.length,
    classifierMockDecisionMatches: decisions.filter((decision) => decision.actual === decision.expected && decision.criticalFieldsMatch).length,
    classifierMockSilentCriticalErrors: classifierChecks.reduce((sum, check) => sum + check.silentCriticalErrors, 0),
    classifierMockFalseRejects: classifierChecks.reduce((sum, check) => sum + check.falseRejects, 0),
    pdfTextLayer: pdfChecks,
    googleEnterpriseOcrAdapterMock: "pass_document_tokens_without_cell_structure_or_geometry",
    illegibleMetric: "not_tested_no_illegible_cells",
  },
  matrix: costPlan.matrix,
  totals: costPlan.totals,
  budget: costPlan.budget,
  pricingBasis: costPlan.pricingBasis,
  latencyGate: costPlan.latencyGate,
  storagePlan: costPlan.storagePlan,
  gate: costPlan.gate,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
