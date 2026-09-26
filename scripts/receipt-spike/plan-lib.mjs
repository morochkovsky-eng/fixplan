import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifestPath = path.join(root, "spike-manifest.json");
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
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

const initialMatrix = [
  { id: "oracle-literal-c1", inputs: 10, documents: 11, repeats: 3, readerCalls: 0, classifierCalls: 30, estimateUsd: oracleC1PerRun * 3 },
  { id: "oracle-literal-c2", inputs: 10, documents: 11, repeats: 3, readerCalls: 0, classifierCalls: 30, estimateUsd: oracleC2PerRun * 3 },
  { id: "r1-c1-clean-photo", inputs: 20, documents: 22, repeats: 3, readerCalls: 60, classifierCalls: 60, estimateUsd: r1C1PerRun * 3 },
  { id: "r3-c1-pdf", inputs: 10, documents: 11, repeats: 1, readerCalls: 0, classifierCalls: 10, estimateUsd: r3C1 },
  { id: "r1-reuse-c2", inputs: 20, documents: 22, repeats: 3, readerCalls: 0, classifierCalls: 60, estimateUsd: r1C2PerRun * 3 },
];
const r2MatrixEntry = {
  id: "r2-enterprise-ocr-c1-clean-photo",
  inputs: 20,
  documents: 22,
  repeats: 1,
  readerCalls: 20,
  classifierCalls: 20,
  estimateUsd: r2C1,
  textMetricGranularity: "document_token",
  structureGate: "not_applicable",
  geometryGate: "not_applicable",
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const integrity = {
  manifestSha256: sha256(manifestBytes),
  readerPromptSha256: sha256(readerPrompt),
  classifierPromptSha256: sha256(classifierPrompt),
  sourceSha256: Object.fromEntries([
    "lib/server/receipt-spike/adapters.ts",
    "lib/server/receipt-spike/budget.ts",
    "lib/server/receipt-spike/matrix-runner.ts",
    "lib/server/receipt-spike/providers.ts",
    "lib/server/receipt-spike/runner.ts",
    "scripts/receipt-spike/approval-plan.mjs",
    "scripts/receipt-spike/plan-lib.mjs",
    "scripts/receipt-spike/run-matrix.mjs",
  ].map((file) => [file, sha256(fs.readFileSync(file))])),
};

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function buildReceiptSpikePlan({ includeR2 = false } = {}) {
  const matrix = (includeR2 ? [...initialMatrix.slice(0, 3), r2MatrixEntry, ...initialMatrix.slice(3)] : initialMatrix)
    .map((entry) => ({ ...entry, estimateUsd: Number(entry.estimateUsd.toFixed(4)), status: "planned_not_run" }));
  const planningEstimateUsd = Number(sum(matrix.map((entry) => entry.estimateUsd)).toFixed(4));
  const report = {
  schemaVersion: "receipt-spike-gate-v1",
  baselineCommit: manifest.baselineCommit,
  includeR2,
  r2FollowUpPolicy: {
    prerequisite: "oracle_c1_passes_and_failure_localized_to_reader",
    maxR1PromptRevisionsBeforeDecision: 2,
    numericRecallMinimum: { png_clean: 0.99, photo_telegram: 0.97 },
    blankCellsFilledMaximum: 0,
    inventedNumbersMaximum: 0,
    rowColumnAccuracyMinimum: 0.98,
    moneyRowNumericStability: "identical_across_three_runs",
    r1CostPerDocumentMaximumUsd: 0.1,
    r1LatencyP50MaximumMs: 45000,
    realDocuments: "only_after_authorized_real_document_evaluation_and_reader_failure",
  },
  paidCallsExecuted: 0,
  providerClientsInvoked: false,
  integrity,
  matrix,
  totals: {
    openAiCalls: includeR2 ? 270 : 250,
    googleDocumentAiCalls: includeR2 ? 20 : 0,
    localPdfExtractions: 10,
    providerCalls: includeR2 ? 290 : 250,
    planningEstimateUsd,
    safetyMultiplier,
  },
  budget: {
    planningEstimateUsd,
    maximumAuthorizedSpendUsd: 12,
    estimateIsGuaranteedCeiling: false,
    enforcement: "stop_before_next_provider_call_if_recorded_spend_plus_reserved_call_max_would_exceed_cap",
    reservationPolicy: "request_specific_utf8_and_image_token_upper_bound_v2",
    reservationBasis: "Each OpenAI reservation is computed from exact serialized request bytes, a separate image-patch ceiling, protocol allowance, fixed max output, long-context pricing, and cache-write premium. When R2 is selected, Google OCR reserves $0.01 for a pinned single-image input.",
    seriesLock: "exclusive_for_full_execution",
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
    method: "Planning estimate uses UTF-8 bytes/4 and a 1.5x multiplier. Runtime reservations use conservative request-specific upper bounds. Returned usage produces both a nominal list-price estimate and a conservative budget charge; cap enforcement uses the latter.",
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
  return report;
}
