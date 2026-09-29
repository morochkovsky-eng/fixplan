import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { indexLiteralDocument } from "../receipt-core";
import type { RoleClassification, VisualDocumentInput } from "../receipt-core";
import { adaptPdfTextLayer } from "./adapters";
import { validateRoleClassification } from "../receipt-core/roles";
import { acquireReceiptSpikeSeriesLock, ReceiptSpikeBudgetLedger, RECEIPT_SPIKE_HARD_CAP_MICROUSD } from "./budget";
import type { ReceiptSpikeCarryover } from "./budget";
import { adapterVersion } from "./adapters";
import {
  assertNoEvaluatorLeak, evaluateEndToEnd, evaluateReader, prepareClassifierInput, readerEvaluationProfile, stringifyClassifierInput,
} from "./evaluator";
import type { GoogleEnterpriseOcrClient, OpenAiReceiptSpikeClient, ProviderJsonResult, OpenAiClassifierPayload } from "./providers";
import { classifierInputInstruction, OpenAiOutputIssue } from "./providers";
import { classifierResponseSchema } from "./classifier-schema";
import { classifierWireToCore } from "./classifier-schema";
import { parseClassifierOutput } from "./adapters";
import { bindSeriesToLedger, enforceReturnedModelSeries, executeBudgetedProviderCall, readPrivateJson, writePrivateJson } from "./runner";

type Descriptor = { path: string; sha256: string; bytes: number };
type ManifestFile = {
  fileId: string;
  inputs: Record<"png_clean" | "photo_telegram" | "pdf_digital", Descriptor & { width?: number; height?: number }>;
  evaluator: Record<"literal_source" | "literal_photo" | "geometry_photo" | "semantic", Descriptor>;
};
type Manifest = {
  baselineCommit: string;
  files: ManifestFile[];
  prompts: { reader: { sha256: string }; classifier: { sha256: string } };
  models: Record<string, Record<string, unknown>>;
};

export type MatrixScheduleStep = {
  id: string;
  cell: string;
  kind: "provider_reader" | "provider_classifier" | "local_reader";
  fileId: string;
  variant: "png_clean" | "photo_telegram" | "pdf_digital" | "oracle_literal";
  runNumber: number;
  provider?: "openai" | "google-document-ai";
};

const IMAGE_VARIANTS = ["png_clean", "photo_telegram"] as const;
const GOOGLE_OCR_RESERVATION_MICROUSD = 10_000;

export function buildReceiptSpikeSchedule(manifest: Manifest, options: { includeR2?: boolean; oracleOnly?: boolean; readerOnly?: boolean } = {}): MatrixScheduleStep[] {
  const steps: MatrixScheduleStep[] = [];
  if (options.readerOnly) {
    for (let run = 1; run <= 3; run += 1) for (const variant of IMAGE_VARIANTS) for (const file of manifest.files) {
      steps.push({ id: `r1-reader-${file.fileId}-${variant}-${run}`, cell: "r1-reader-clean-photo", kind: "provider_reader", fileId: file.fileId, variant, runNumber: run, provider: "openai" });
    }
    return steps;
  }
  for (const classifier of ["c1", "c2"] as const) for (let run = 1; run <= 3; run += 1) for (const file of manifest.files) {
    steps.push({ id: `oracle-${classifier}-${file.fileId}-${run}`, cell: `oracle-literal-${classifier}`, kind: "provider_classifier", fileId: file.fileId, variant: "oracle_literal", runNumber: run, provider: "openai" });
  }
  if (options.oracleOnly) return steps;
  for (let run = 1; run <= 3; run += 1) for (const variant of IMAGE_VARIANTS) for (const file of manifest.files) {
    steps.push({ id: `r1-${file.fileId}-${variant}-${run}`, cell: "r1-c1-clean-photo", kind: "provider_reader", fileId: file.fileId, variant, runNumber: run, provider: "openai" });
    steps.push({ id: `r1-c1-${file.fileId}-${variant}-${run}`, cell: "r1-c1-clean-photo", kind: "provider_classifier", fileId: file.fileId, variant, runNumber: run, provider: "openai" });
  }
  if (options.includeR2) for (const variant of IMAGE_VARIANTS) for (const file of manifest.files) {
    steps.push({ id: `r2-${file.fileId}-${variant}-1`, cell: "r2-enterprise-ocr-c1-clean-photo", kind: "provider_reader", fileId: file.fileId, variant, runNumber: 1, provider: "google-document-ai" });
    steps.push({ id: `r2-c1-${file.fileId}-${variant}-1`, cell: "r2-enterprise-ocr-c1-clean-photo", kind: "provider_classifier", fileId: file.fileId, variant, runNumber: 1, provider: "openai" });
  }
  for (const file of manifest.files) {
    steps.push({ id: `r3-${file.fileId}-pdf-1`, cell: "r3-c1-pdf", kind: "local_reader", fileId: file.fileId, variant: "pdf_digital", runNumber: 1 });
    steps.push({ id: `r3-c1-${file.fileId}-pdf-1`, cell: "r3-c1-pdf", kind: "provider_classifier", fileId: file.fileId, variant: "pdf_digital", runNumber: 1, provider: "openai" });
  }
  for (let run = 1; run <= 3; run += 1) for (const variant of IMAGE_VARIANTS) for (const file of manifest.files) {
    steps.push({ id: `r1-reuse-c2-${file.fileId}-${variant}-${run}`, cell: "r1-reuse-c2", kind: "provider_classifier", fileId: file.fileId, variant, runNumber: run, provider: "openai" });
  }
  return steps;
}

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyReceiptSpikeCarryover(outputRoot: string, currentSeries: string, approved: ReceiptSpikeCarryover[]) {
  fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const existing = fs.readdirSync(outputRoot, { withFileTypes: true }).filter((item) => item.name !== currentSeries).map((item) => {
    if (!item.isDirectory()) throw new Error("prior_series_invalid");
    return item.name;
  }).sort();
  if (JSON.stringify(existing) !== JSON.stringify(approved.map((item) => item.series))) throw new Error("prior_series_carryover_incomplete");
  let committed = 0;
  for (const binding of approved) {
    const runRoot = path.join(outputRoot, binding.series);
    const ledgerFile = path.join(runRoot, "spend-ledger.jsonl");
    if (!fs.statSync(path.join(runRoot, "run.meta.json")).isFile() || !fs.lstatSync(ledgerFile).isFile()) throw new Error("prior_series_binding_missing");
    if (sha256(fs.readFileSync(ledgerFile)) !== binding.ledgerSha256) throw new Error("prior_series_ledger_changed");
    const snapshot = new ReceiptSpikeBudgetLedger(ledgerFile).snapshot();
    if (snapshot.committedMicrousd !== binding.committedMicrousd) throw new Error("prior_series_budget_mismatch");
    committed += snapshot.committedMicrousd;
  }
  if (committed >= RECEIPT_SPIKE_HARD_CAP_MICROUSD) throw new Error("prior_series_budget_exhausted");
  return committed;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function verifyDescriptor(root: string, descriptor: Descriptor) {
  const absolute = path.join(root, descriptor.path);
  const bytes = fs.readFileSync(absolute);
  if (sha256(bytes) !== descriptor.sha256 || bytes.byteLength !== descriptor.bytes) throw new Error(`manifest_input_mismatch:${descriptor.path}`);
}

export function verifyReceiptSpikeManifest(root: string, manifest: Manifest, integrity?: {
  manifestSha256: string;
  readerPromptSha256: string;
  classifierPromptSha256: string;
  classifierContractSha256: string;
  classifierResponseSchemaSha256: string;
  readerPrompt: string;
  classifierPrompt: string;
}) {
  for (const file of manifest.files) {
    for (const descriptor of Object.values(file.inputs)) verifyDescriptor(root, descriptor);
    for (const descriptor of Object.values(file.evaluator)) verifyDescriptor(root, descriptor);
  }
  assertNoEvaluatorLeak(manifest.files.flatMap((file) => Object.values(file.inputs).map((descriptor) => descriptor.path)));
  if (manifest.models.R1.requestedModelId !== "gpt-6-sol" || manifest.models.C1.requestedModelId !== "gpt-6-sol" || manifest.models.C2.requestedModelId !== "gpt-6-luna") {
    throw new Error("unsupported_manifest_model_configuration");
  }
  if (integrity) {
    if (sha256(fs.readFileSync(path.join(root, "spike-manifest.json"))) !== integrity.manifestSha256) throw new Error("manifest_plan_hash_mismatch");
    if (sha256(integrity.readerPrompt) !== integrity.readerPromptSha256 || manifest.prompts.reader.sha256 !== integrity.readerPromptSha256) throw new Error("reader_prompt_plan_hash_mismatch");
    if (sha256(integrity.classifierPrompt) !== integrity.classifierPromptSha256 || manifest.prompts.classifier.sha256 !== integrity.classifierPromptSha256) throw new Error("classifier_prompt_plan_hash_mismatch");
    if (sha256(classifierInputInstruction()) !== integrity.classifierContractSha256) throw new Error("classifier_contract_plan_hash_mismatch");
    if (sha256(JSON.stringify(classifierResponseSchema)) !== integrity.classifierResponseSchemaSha256) throw new Error("classifier_schema_plan_hash_mismatch");
  }
  return manifest.files.length;
}

function artifactRoot(runRoot: string, cell: string, fileId: string, variant: string, runNumber: number) {
  return path.join(runRoot, cell, fileId, variant, `run-${runNumber}`);
}

function timeoutSignal() {
  return AbortSignal.timeout(120_000);
}

function mimeType(variant: "png_clean" | "photo_telegram") {
  return variant === "png_clean" ? "image/png" as const : "image/jpeg" as const;
}

function asBudgetResult<T>(result: ProviderJsonResult<T>) {
  return result;
}

export async function runReceiptSpikeMatrix(options: {
  fixtureRoot: string;
  manifest: Manifest;
  series: string;
  planSha256: string;
  includeR2: boolean;
  canaryOnly?: boolean;
  oracleOnly?: boolean;
  readerOnly?: boolean;
  integrity: { manifestSha256: string; readerPromptSha256: string; classifierPromptSha256: string; classifierContractSha256: string; classifierResponseSchemaSha256: string; sourceSha256: Record<string, string> };
  outputRoot: string;
  readerPrompt: string;
  classifierPrompt: string;
  approval: { approved: true; planSha256: string; maximumAuthorizedSpendMicrousd: number; approvalId: string; series: string; carryover: ReceiptSpikeCarryover[] };
  openai: OpenAiReceiptSpikeClient;
  google?: GoogleEnterpriseOcrClient;
}) {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(options.series)) throw new Error("invalid_series_name");
  if ([options.oracleOnly, options.canaryOnly, options.readerOnly].filter(Boolean).length > 1 || (options.includeR2 && (options.oracleOnly || options.canaryOnly || options.readerOnly))) throw new Error("incompatible_spike_stage_options");
  if (!options.approval.approved || options.approval.planSha256 !== options.planSha256 || options.approval.maximumAuthorizedSpendMicrousd !== 12_000_000 || options.approval.series !== options.series || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(options.approval.approvalId)) {
    throw new Error("paid_execution_approval_mismatch");
  }
  if (options.includeR2 && !options.google) throw new Error("r2_google_client_required");
  verifyReceiptSpikeManifest(options.fixtureRoot, options.manifest, { ...options.integrity, readerPrompt: options.readerPrompt, classifierPrompt: options.classifierPrompt });
  const runRoot = path.join(options.outputRoot, options.series);
  const releaseLocks: Array<() => void> = [];
  try {
  const seriesNames = [...options.approval.carryover.map((item) => item.series), options.series].sort();
  if (new Set(seriesNames).size !== seriesNames.length) throw new Error("duplicate_series_lock");
  for (const name of seriesNames) releaseLocks.push(acquireReceiptSpikeSeriesLock(path.join(options.outputRoot, name)));
  const priorCommittedMicrousd = verifyReceiptSpikeCarryover(options.outputRoot, options.series, options.approval.carryover);
  const ledgerFile = path.join(runRoot, "spend-ledger.jsonl");
  bindSeriesToLedger(runRoot, {
    planSha256: options.planSha256,
    series: options.series,
    approvalId: options.approval.approvalId,
    baselineCommit: options.manifest.baselineCommit,
    integrity: options.integrity,
    carryover: options.approval.carryover,
  });
  const ledger = new ReceiptSpikeBudgetLedger(ledgerFile, RECEIPT_SPIKE_HARD_CAP_MICROUSD - priorCommittedMicrousd);
  const providerRuns: Array<{ cell: string; latencyMs: number; actualCostMicrousd: number; budgetChargeMicrousd: number; requestedModelId: string; returnedModelId: string }> = [];
  const evaluations: Array<{ cell: string; evaluation: ReturnType<typeof evaluateEndToEnd> }> = [];

  const reader = async (cell: string, file: ManifestFile, variant: typeof IMAGE_VARIANTS[number], run: number, kind: "R1" | "R2") => {
    const descriptor = file.inputs[variant];
    const bytes = fs.readFileSync(path.join(options.fixtureRoot, descriptor.path));
    const directory = path.join(artifactRoot(runRoot, cell, file.fileId, variant, run), "reader");
    const callId = `${cell}:${file.fileId}:${variant}:${run}:reader`;
    if (kind === "R1" && (!(descriptor.width && descriptor.width > 0) || !(descriptor.height && descriptor.height > 0))) throw new Error(`image_dimensions_missing:${file.fileId}:${variant}`);
    const costBound = kind === "R1"
      ? options.openai.maximumImageCost({ model: "gpt-6-sol", instructions: options.readerPrompt, bytes, mimeType: mimeType(variant), width: descriptor.width!, height: descriptor.height! })
      : { maximumCostMicrousd: GOOGLE_OCR_RESERVATION_MICROUSD, inputTokenUpperBound: null, outputTokenUpperBound: null };
    const result = await executeBudgetedProviderCall<VisualDocumentInput>({
      ledger,
      callId,
      provider: kind === "R1" ? "openai" : "google-document-ai",
      reservedMaxMicrousd: costBound.maximumCostMicrousd,
      artifactDirectory: directory,
      requestMetadata: {
        callId,
        fileId: file.fileId,
        variant,
        inputSha256: descriptor.sha256,
        promptSha256: kind === "R1" ? options.manifest.prompts.reader.sha256 : null,
        adapterVersion,
        reservedMaxMicrousd: costBound.maximumCostMicrousd,
        inputTokenUpperBound: costBound.inputTokenUpperBound,
        outputTokenUpperBound: costBound.outputTokenUpperBound,
      },
      dispatch: async () => asBudgetResult(kind === "R1"
        ? await options.openai.readImage({ model: "gpt-6-sol", instructions: options.readerPrompt, bytes, mimeType: mimeType(variant), signal: timeoutSignal() })
        : await options.google!.read({ bytes, mimeType: mimeType(variant), signal: timeoutSignal() })),
    });
    enforceReturnedModelSeries(path.join(runRoot, "model-series.json"), {
      provider: kind === "R1" ? "openai" : "google-document-ai",
      requestedModelId: result.result.requestedModelId,
      returnedModelId: result.result.returnedModelId,
    });
    providerRuns.push({ cell, latencyMs: result.result.latencyMs, actualCostMicrousd: result.result.actualCostMicrousd, budgetChargeMicrousd: result.result.budgetChargeMicrousd, requestedModelId: result.result.requestedModelId, returnedModelId: result.result.returnedModelId });
    writePrivateJson(path.join(directory, "reader.visual.json"), result.result.parsed);
    return result.result.parsed;
  };

  const classify = async (params: {
    cell: string;
    file: ManifestFile;
    variant: "png_clean" | "photo_telegram" | "pdf_digital" | "oracle_literal";
    run: number;
    readerId: "R1-openai-vision" | "R2-google-enterprise-ocr" | "R3-pdf-text-layer" | "oracle-reader";
    classifierId: "C1-openai-strong" | "C2-openai-economy";
    readerInput: VisualDocumentInput;
  }) => {
    const input = prepareClassifierInput(params.file.fileId, params.readerInput);
    const wire = stringifyClassifierInput(input);
    const classifierKey = params.classifierId === "C1-openai-strong" ? "C1" : "C2";
    const model = classifierKey === "C1" ? "gpt-6-sol" as const : "gpt-6-luna" as const;
    const directory = path.join(artifactRoot(runRoot, params.cell, params.file.fileId, params.variant, params.run), "classifier");
    const callId = `${params.cell}:${params.file.fileId}:${params.variant}:${params.run}:classifier`;
    const costBound = options.openai.maximumClassifierCost({ model, instructions: options.classifierPrompt, classifierInputJson: wire, reasoningEffort: classifierKey === "C1" ? "low" : "medium" });
    writePrivateJson(path.join(directory, "classifier.input.json"), input);
    const result = await executeBudgetedProviderCall<RoleClassification, OpenAiClassifierPayload>({
      ledger,
      callId,
      provider: "openai",
      reservedMaxMicrousd: costBound.maximumCostMicrousd,
      artifactDirectory: directory,
      requestMetadata: {
        callId,
        fileId: params.file.fileId,
        variant: params.variant,
        indexedLiteralSha256: sha256(wire),
        promptSha256: options.manifest.prompts.classifier.sha256,
        adapterVersion,
        reservedMaxMicrousd: costBound.maximumCostMicrousd,
        inputTokenUpperBound: costBound.inputTokenUpperBound,
        outputTokenUpperBound: costBound.outputTokenUpperBound,
      },
      dispatch: async () => asBudgetResult(await options.openai.classifyRaw({
        model,
        instructions: options.classifierPrompt,
        classifierInputJson: wire,
        reasoningEffort: classifierKey === "C1" ? "low" : "medium",
        signal: timeoutSignal(),
      })),
      parseCompleted: (payload) => {
        if (payload.issue) throw new OpenAiOutputIssue(payload.issue);
        return parseClassifierOutput(classifierWireToCore(JSON.parse(payload.text)));
      },
    });
    enforceReturnedModelSeries(path.join(runRoot, "model-series.json"), {
      provider: "openai",
      requestedModelId: result.result.requestedModelId,
      returnedModelId: result.result.returnedModelId,
    });
    providerRuns.push({ cell: params.cell, latencyMs: result.result.latencyMs, actualCostMicrousd: result.result.actualCostMicrousd, budgetChargeMicrousd: result.result.budgetChargeMicrousd, requestedModelId: result.result.requestedModelId, returnedModelId: result.result.returnedModelId });
    writePrivateJson(path.join(directory, "classification.json"), result.result.parsed);
    if (options.canaryOnly) {
      const validation = validateRoleClassification(input.literalDocument, result.result.parsed);
      const formatErrors = validation.diagnostics.filter((item) => item.severity === "error");
      writePrivateJson(path.join(directory, "canary-validation.json"), { formatErrors });
      if (formatErrors.length) throw new Error(`canary_format_invalid:${[...new Set(formatErrors.map((item) => item.code))].join(",")}`);
      return;
    }
    const semantic = readJson<{ fileId: string; roleClassification: RoleClassification; documents: Array<{ docId: string; documentKind: string; rowIds: string[]; expected: { billingPeriod: string | null; mandatoryDue: { valueMinor: string | null }; decision: string } }> }>(path.join(options.fixtureRoot, params.file.evaluator.semantic.path));
    const oracleKey = params.variant === "photo_telegram" ? "literal_photo" : "literal_source";
    const readerOracle = params.readerId === "oracle-reader" ? undefined : readJson<VisualDocumentInput>(path.join(options.fixtureRoot, params.file.evaluator[oracleKey].path));
    const evaluation = evaluateEndToEnd({
      fileId: params.file.fileId,
      variant: params.variant,
      runNumber: params.run,
      readerId: params.readerId,
      classifierId: params.classifierId,
      readerInput: params.readerInput,
      readerOracle,
      classifierOutput: result.result.parsed,
      semanticOracle: semantic,
    });
    writePrivateJson(path.join(directory, "evaluation.json"), evaluation);
    evaluations.push({ cell: params.cell, evaluation });
  };

  if (options.canaryOnly) {
    const file = options.manifest.files.find((item) => item.fileId === "S10");
    if (!file) throw new Error("canary_fixture_missing");
    const literal = readJson<VisualDocumentInput>(path.join(options.fixtureRoot, file.evaluator.literal_source.path));
    await classify({ cell: "canary-oracle-s10-c1", file, variant: "oracle_literal", run: 1, readerId: "oracle-reader", classifierId: "C1-openai-strong", readerInput: literal });
    const summary = { canary: "passed", fileId: "S10", providerCalls: 1, budget: ledger.snapshot(), latencyMs: providerRuns[0].latencyMs, returnedModelIds: providerRuns.map((item) => item.returnedModelId) };
    writePrivateJson(path.join(runRoot, "run.summary.json"), summary);
    return summary;
  }

  if (options.readerOnly) {
    const readerRuns: Array<{ fileId: string; variant: typeof IMAGE_VARIANTS[number]; runNumber: number; numericFingerprint: string; metrics: ReturnType<typeof evaluateReader> }> = [];
    for (let run = 1; run <= 3; run += 1) for (const variant of IMAGE_VARIANTS) for (const file of options.manifest.files) {
      const visual = await reader("r1-reader-clean-photo", file, variant, run, "R1");
      const oracleKey = variant === "photo_telegram" ? "literal_photo" : "literal_source";
      const oracle = readJson<VisualDocumentInput>(path.join(options.fixtureRoot, file.evaluator[oracleKey].path));
      const metrics = evaluateReader(oracle, visual, readerEvaluationProfile("R1-openai-vision"));
      const numericFingerprint = sha256(indexLiteralDocument(visual).document.pages.flatMap((page) => page.blocks.flatMap((block) =>
        block.rows.flatMap((row) => row.cells.flatMap((cell) => cell.numericTokens.map((token) => `${token.raw}\u0000${token.printedSign}`))))).sort().join("\u0001"));
      writePrivateJson(path.join(artifactRoot(runRoot, "r1-reader-clean-photo", file.fileId, variant, run), "reader", "reader.evaluation.json"), metrics);
      readerRuns.push({ fileId: file.fileId, variant, runNumber: run, metrics, numericFingerprint });
    }
    const cells = IMAGE_VARIANTS.map((variant) => {
      const runs = readerRuns.filter((item) => item.variant === variant);
      const threshold = variant === "png_clean" ? 0.99 : 0.97;
      const average = (field: "numericRecall" | "numericPrecision" | "rowColumnAccuracy") =>
        runs.reduce((sum, item) => sum + (item.metrics[field] ?? 0), 0) / runs.length;
      return {
        variant, evaluations: runs.length,
        meanNumericRecall: average("numericRecall"),
        minimumNumericRecall: Math.min(...runs.map((item) => item.metrics.numericRecall)),
        runsBelowNumericRecallThreshold: runs.filter((item) => item.metrics.numericRecall < threshold).length,
        meanNumericPrecision: average("numericPrecision"),
        runsWithInventedNumericTokens: runs.filter((item) => item.metrics.numericPrecision < 1).length,
        meanRowColumnAccuracy: average("rowColumnAccuracy"),
        minimumRowColumnAccuracy: Math.min(...runs.map((item) => item.metrics.rowColumnAccuracy ?? 0)),
        runsBelowRowColumnThreshold: runs.filter((item) => (item.metrics.rowColumnAccuracy ?? 0) < 0.98).length,
        blankCellsFilled: runs.reduce((sum, item) => sum + (item.metrics.blankCellsFilled ?? 0), 0),
        unstableNumericInputs: [...new Set(runs.map((item) => item.fileId))].filter((fileId) =>
          new Set(runs.filter((item) => item.fileId === fileId).map((item) => item.numericFingerprint)).size > 1).length,
        illegibleMetricStatuses: [...new Set(runs.map((item) => item.metrics.illegibleMetricStatus))],
      };
    });
    const sortedLatencies = providerRuns.map((item) => item.latencyMs).sort((left, right) => left - right);
    const percentile = (fraction: number) => sortedLatencies[Math.min(sortedLatencies.length - 1, Math.ceil(sortedLatencies.length * fraction) - 1)];
    const documentRuns = options.manifest.files.reduce((sum, file) => sum + readJson<{ documents: unknown[] }>(path.join(options.fixtureRoot, file.evaluator.semantic.path)).documents.length, 0) * IMAGE_VARIANTS.length * 3;
    const summary = {
      stage: "r1_reader_only", finishedAt: new Date().toISOString(), providerCalls: providerRuns.length,
      budget: ledger.snapshot(),
      latencyP50Ms: percentile(0.5), latencyP95Ms: percentile(0.95),
      actualCostPerDocumentRunUsd: providerRuns.reduce((sum, item) => sum + item.actualCostMicrousd, 0) / documentRuns / 1_000_000,
      cells,
    };
    writePrivateJson(path.join(runRoot, "run.summary.json"), summary);
    return summary;
  }

  for (const classifierId of ["C1-openai-strong", "C2-openai-economy"] as const) for (let run = 1; run <= 3; run += 1) for (const file of options.manifest.files) {
    const literal = readJson<VisualDocumentInput>(path.join(options.fixtureRoot, file.evaluator.literal_source.path));
    await classify({ cell: classifierId === "C1-openai-strong" ? "oracle-literal-c1" : "oracle-literal-c2", file, variant: "oracle_literal", run, readerId: "oracle-reader", classifierId, readerInput: literal });
  }
  if (options.oracleOnly) {
    const cells = ["oracle-literal-c1", "oracle-literal-c2"].map((cell) => {
      const results = evaluations.filter((item) => item.cell === cell).map((item) => item.evaluation);
      const calls = providerRuns.filter((item) => item.cell === cell);
      return {
        cell,
        evaluations: results.length,
        providerCalls: calls.length,
        silentCriticalErrors: results.reduce((sum, item) => sum + item.silentCriticalErrors, 0),
        unassessableConfirmedDocuments: results.reduce((sum, item) => sum + item.unassessableConfirmedDocuments, 0),
        documentAlignmentFailures: results.reduce((sum, item) => sum + item.documentAlignmentFailures, 0),
        falseRejects: results.reduce((sum, item) => sum + item.falseRejects, 0),
        meanMonetaryRoleAccuracy: results.reduce((sum, item) => sum + item.classifierMetrics.monetaryRoleAccuracy, 0) / results.length,
      };
    });
    const summary = { stage: "oracle_only", finishedAt: new Date().toISOString(), providerCalls: providerRuns.length, budget: ledger.snapshot(), cells };
    writePrivateJson(path.join(runRoot, "run.summary.json"), summary);
    return summary;
  }

  for (let run = 1; run <= 3; run += 1) for (const variant of IMAGE_VARIANTS) for (const file of options.manifest.files) {
    const visual = await reader("r1-c1-clean-photo", file, variant, run, "R1");
    await classify({ cell: "r1-c1-clean-photo", file, variant, run, readerId: "R1-openai-vision", classifierId: "C1-openai-strong", readerInput: visual });
  }

  if (options.includeR2) for (const variant of IMAGE_VARIANTS) for (const file of options.manifest.files) {
    const visual = await reader("r2-enterprise-ocr-c1-clean-photo", file, variant, 1, "R2");
    await classify({ cell: "r2-enterprise-ocr-c1-clean-photo", file, variant, run: 1, readerId: "R2-google-enterprise-ocr", classifierId: "C1-openai-strong", readerInput: visual });
  }

  for (const file of options.manifest.files) {
    const directory = path.join(artifactRoot(runRoot, "r3-c1-pdf", file.fileId, "pdf_digital", 1), "reader");
    const visual = await adaptPdfTextLayer(fs.readFileSync(path.join(options.fixtureRoot, file.inputs.pdf_digital.path)));
    writePrivateJson(path.join(directory, "reader.visual.json"), visual);
    await classify({ cell: "r3-c1-pdf", file, variant: "pdf_digital", run: 1, readerId: "R3-pdf-text-layer", classifierId: "C1-openai-strong", readerInput: visual });
  }

  for (let run = 1; run <= 3; run += 1) for (const variant of IMAGE_VARIANTS) for (const file of options.manifest.files) {
    const source = path.join(artifactRoot(runRoot, "r1-c1-clean-photo", file.fileId, variant, run), "reader", "provider-result.json");
    const visual = readPrivateJson<ProviderJsonResult<VisualDocumentInput>>(source).parsed;
    await classify({ cell: "r1-reuse-c2", file, variant, run, readerId: "R1-openai-vision", classifierId: "C2-openai-economy", readerInput: visual });
  }

  const percentile = (values: number[], fraction: number) => {
    if (!values.length) return null;
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
  };
  const cells = [...new Set(evaluations.map((item) => item.cell))].sort().map((cell) => {
    const cellEvaluations = evaluations.filter((item) => item.cell === cell).map((item) => item.evaluation);
    const runs = providerRuns.filter((item) => item.cell === cell);
    return {
      cell,
      evaluations: cellEvaluations.length,
      providerCalls: runs.length,
      actualCostMicrousd: runs.reduce((sum, item) => sum + item.actualCostMicrousd, 0),
      budgetChargeMicrousd: runs.reduce((sum, item) => sum + item.budgetChargeMicrousd, 0),
      latencyP50Ms: percentile(runs.map((item) => item.latencyMs), 0.5),
      latencyP95Ms: percentile(runs.map((item) => item.latencyMs), 0.95),
      returnedModelIds: [...new Set(runs.map((item) => item.returnedModelId))].sort(),
      silentCriticalErrors: cellEvaluations.reduce((sum, item) => sum + item.silentCriticalErrors, 0),
      unassessableConfirmedDocuments: cellEvaluations.reduce((sum, item) => sum + item.unassessableConfirmedDocuments, 0),
      documentAlignmentFailures: cellEvaluations.reduce((sum, item) => sum + item.documentAlignmentFailures, 0),
      falseRejects: cellEvaluations.reduce((sum, item) => sum + item.falseRejects, 0),
      meanMonetaryRoleAccuracy: cellEvaluations.reduce((sum, item) => sum + item.classifierMetrics.monetaryRoleAccuracy, 0) / cellEvaluations.length,
    };
  });
  const summary = {
    finishedAt: new Date().toISOString(),
    budget: ledger.snapshot(),
    providerCalls: buildReceiptSpikeSchedule(options.manifest, { includeR2: options.includeR2 }).filter((step) => step.kind !== "local_reader").length,
    latencyP50Ms: percentile(providerRuns.map((item) => item.latencyMs), 0.5),
    latencyP95Ms: percentile(providerRuns.map((item) => item.latencyMs), 0.95),
    cells,
  };
  writePrivateJson(path.join(runRoot, "run.summary.json"), summary);
  return summary;
  } finally {
    releaseLocks.reverse().forEach((release) => release());
  }
}
