import fs from "node:fs";
import path from "node:path";

const root = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "spike-manifest.json"), "utf8"));
const readerPrompt = fs.readFileSync("prompts/receipt-spike/reader-v1.md", "utf8");
const classifierPrompt = fs.readFileSync("prompts/receipt-spike/classifier-v1.md", "utf8");
const prices = {
  "gpt-6-sol": { input: 2 / 1_000_000, output: 10 / 1_000_000 },
  "gpt-6-luna": { input: 0.1 / 1_000_000, output: 0.5 / 1_000_000 },
};

const tokenEstimate = (bytes) => Math.ceil(bytes / 4);
const imageTokens = (width, height) => Math.ceil(Math.ceil(width / 32) * Math.ceil(height / 32) * 1.2);
const promptTokens = { reader: tokenEstimate(Buffer.byteLength(readerPrompt)), classifier: tokenEstimate(Buffer.byteLength(classifierPrompt)) };
const safetyMultiplier = 1.5;

function modelCost(model, inputTokens, outputTokens) {
  const price = prices[model];
  return (inputTokens * price.input + outputTokens * price.output) * safetyMultiplier;
}

function fileEstimate(file, variant, classifierModel, includeReader) {
  const literalKey = variant === "photo_telegram" ? "literal_photo" : "literal_source";
  const literalBytes = file.evaluator[literalKey].bytes;
  const semanticBytes = file.evaluator.semantic.bytes;
  const input = file.inputs[variant];
  const readerCost = includeReader ? modelCost("gpt-6-sol", imageTokens(input.width, input.height) + promptTokens.reader, tokenEstimate(literalBytes)) : 0;
  const classifierCost = modelCost(classifierModel, tokenEstimate(literalBytes) + promptTokens.classifier, tokenEstimate(semanticBytes));
  return { readerCost, classifierCost };
}

function sum(values) { return values.reduce((total, value) => total + value, 0); }

const allImages = manifest.files.flatMap((file) => [
  { file, variant: "png_clean" },
  { file, variant: "photo_telegram" },
]);
const oracleC1PerRun = sum(manifest.files.map((file) => fileEstimate(file, "png_clean", "gpt-6-sol", false).classifierCost));
const oracleC2PerRun = sum(manifest.files.map((file) => fileEstimate(file, "png_clean", "gpt-6-luna", false).classifierCost));
const r1C1PerRun = sum(allImages.map(({ file, variant }) => {
  const estimate = fileEstimate(file, variant, "gpt-6-sol", true);
  return estimate.readerCost + estimate.classifierCost;
}));
const r2C1 = sum(allImages.map(({ file, variant }) => fileEstimate(file, variant, "gpt-6-sol", false).classifierCost)) + 20 * 0.0015;
const r3C1 = sum(manifest.files.map((file) => fileEstimate(file, "png_clean", "gpt-6-sol", false).classifierCost));
const r1C2PerRun = sum(allImages.map(({ file, variant }) => fileEstimate(file, variant, "gpt-6-luna", false).classifierCost));

const matrix = [
  { id: "oracle-literal-c1", inputs: 10, documents: 11, repeats: 3, readerCalls: 0, classifierCalls: 30, estimateUsd: oracleC1PerRun * 3 },
  { id: "oracle-literal-c2", inputs: 10, documents: 11, repeats: 3, readerCalls: 0, classifierCalls: 30, estimateUsd: oracleC2PerRun * 3 },
  { id: "r1-c1-clean-photo", inputs: 20, documents: 22, repeats: 3, readerCalls: 60, classifierCalls: 60, estimateUsd: r1C1PerRun * 3 },
  { id: "r2-enterprise-ocr-c1-clean-photo", inputs: 20, documents: 22, repeats: 1, readerCalls: 20, classifierCalls: 20, estimateUsd: r2C1, structureGate: "not_applicable" },
  { id: "r3-c1-pdf", inputs: 10, documents: 11, repeats: 1, readerCalls: 0, classifierCalls: 10, estimateUsd: r3C1 },
  { id: "r1-reuse-c2", inputs: 20, documents: 22, repeats: 3, readerCalls: 0, classifierCalls: 60, estimateUsd: r1C2PerRun * 3 },
].map((entry) => ({ ...entry, estimateUsd: Number(entry.estimateUsd.toFixed(4)), status: "planned_not_run" }));

const report = {
  schemaVersion: "receipt-spike-gate-v1",
  baselineCommit: manifest.baselineCommit,
  paidCallsExecuted: 0,
  providerClientsInvoked: false,
  matrix,
  totals: {
    openAiCalls: 270,
    googleDocumentAiCalls: 20,
    localPdfExtractions: 10,
    providerCalls: 290,
    planningEstimateUsd: Number(sum(matrix.map((entry) => entry.estimateUsd)).toFixed(4)),
    safetyMultiplier,
  },
  budget: {
    planningEstimateUsd: Number(sum(matrix.map((entry) => entry.estimateUsd)).toFixed(4)),
    maximumAuthorizedSpendUsd: 12,
    estimateIsGuaranteedCeiling: false,
    enforcement: "stop_before_next_provider_call_if_recorded_spend_plus_reserved_call_max_would_exceed_cap",
  },
  pricingBasis: {
    checked: "2026-09-26",
    openai: {
      source: "https://developers.openai.com/api/docs/models",
      "gpt-6-sol": { inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
      "gpt-6-luna": { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5 },
    },
    googleDocumentAi: {
      source: "https://cloud.google.com/products/document-ai/pricing",
      enterpriseOcrUsdPerPage: 0.0015,
      layoutParserUsdPerPage: 0.01,
      selectedForR2: "enterprise_ocr",
      note: "R2 is a text/line-geometry OCR baseline, not Layout Parser. The list-price estimate ignores free-tier allowance.",
    },
    method: "UTF-8 bytes/4 token proxy, documented image patch formula, and 1.5x safety multiplier; actual usage and returned model IDs replace estimates after approval.",
  },
  latencyGate: { p50Seconds: 45, p95Seconds: 120, measured: false },
  storagePlan: {
    root: ".receipt-spike/runs/<series>/<file>/<run>/",
    files: ["request.meta.json", "reader.raw.json", "reader.visual.json", "classifier.input.json", "classifier.raw.json", "classification.json", "evaluation.json"],
    gitIgnored: true,
    evaluatorDataExcludedFromRequests: ["oracle/**", "gold/**", "reports/**", "spike-manifest.json"],
  },
  gate: { paidExecutionRequiresSeparateOwnerApproval: true, approvalRecorded: false, hardBudgetEnforcementRequired: true },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
