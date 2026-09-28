import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { RoleClassification, VisualDocumentInput } from "../receipt-core";
import { adaptPdfTextLayer } from "./adapters";
import { acquireReceiptSpikeSeriesLock, ReceiptSpikeBudgetLedger } from "./budget";
import { adapterVersion } from "./adapters";
import {
  assertNoEvaluatorLeak, evaluateEndToEnd, prepareClassifierInput, stringifyClassifierInput,
} from "./evaluator";
import type { GoogleEnterpriseOcrClient, OpenAiReceiptSpikeClient, ProviderJsonResult } from "./providers";
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

export function buildReceiptSpikeSchedule(manifest: Manifest, options: { includeR2?: boolean } = {}): MatrixScheduleStep[] {
  const steps: MatrixScheduleStep[] = [];
  for (const classifier of ["c1", "c2"] as const) for (let run = 1; run <= 3; run += 1) for (const file of manifest.files) {
    steps.push({ id: `oracle-${classifier}-${file.fileId}-${run}`, cell: `oracle-literal-${classifier}`, kind: "provider_classifier", fileId: file.fileId, variant: "oracle_literal", runNumber: run, provider: "openai" });
  }
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
  integrity: { manifestSha256: string; readerPromptSha256: string; classifierPromptSha256: string; sourceSha256: Record<string, string> };
  outputRoot: string;
  readerPrompt: string;
  classifierPrompt: string;
  approval: { approved: true; planSha256: string; maximumAuthorizedSpendMicrousd: number; approvalId: string; series: string };
  openai: OpenAiReceiptSpikeClient;
  google?: GoogleEnterpriseOcrClient;
}) {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(options.series)) throw new Error("invalid_series_name");
  if (!options.approval.approved || options.approval.planSha256 !== options.planSha256 || options.approval.maximumAuthorizedSpendMicrousd !== 12_000_000 || options.approval.series !== options.series || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(options.approval.approvalId)) {
    throw new Error("paid_execution_approval_mismatch");
  }
  if (options.includeR2 && !options.google) throw new Error("r2_google_client_required");
  verifyReceiptSpikeManifest(options.fixtureRoot, options.manifest, { ...options.integrity, readerPrompt: options.readerPrompt, classifierPrompt: options.classifierPrompt });
  const runRoot = path.join(options.outputRoot, options.series);
  const releaseSeriesLock = acquireReceiptSpikeSeriesLock(runRoot);
  try {
  const ledgerFile = path.join(runRoot, "spend-ledger.jsonl");
  bindSeriesToLedger(runRoot, {
    planSha256: options.planSha256,
    series: options.series,
    approvalId: options.approval.approvalId,
    baselineCommit: options.manifest.baselineCommit,
    integrity: options.integrity,
  });
  const ledger = new ReceiptSpikeBudgetLedger(ledgerFile);
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
    const result = await executeBudgetedProviderCall<RoleClassification>({
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
      dispatch: async () => asBudgetResult(await options.openai.classify({
        model,
        instructions: options.classifierPrompt,
        classifierInputJson: wire,
        reasoningEffort: classifierKey === "C1" ? "low" : "medium",
        signal: timeoutSignal(),
      })),
    });
    enforceReturnedModelSeries(path.join(runRoot, "model-series.json"), {
      provider: "openai",
      requestedModelId: result.result.requestedModelId,
      returnedModelId: result.result.returnedModelId,
    });
    providerRuns.push({ cell: params.cell, latencyMs: result.result.latencyMs, actualCostMicrousd: result.result.actualCostMicrousd, budgetChargeMicrousd: result.result.budgetChargeMicrousd, requestedModelId: result.result.requestedModelId, returnedModelId: result.result.returnedModelId });
    writePrivateJson(path.join(directory, "classification.json"), result.result.parsed);
    const semantic = readJson<{ fileId: string; roleClassification: RoleClassification; documents: Array<{ docId: string; expected: { billingPeriod: string | null; mandatoryDue: { valueMinor: string | null }; decision: string } }> }>(path.join(options.fixtureRoot, params.file.evaluator.semantic.path));
    const oracleKey = params.variant === "photo_telegram" ? "geometry_photo" : "literal_source";
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

  for (const classifierId of ["C1-openai-strong", "C2-openai-economy"] as const) for (let run = 1; run <= 3; run += 1) for (const file of options.manifest.files) {
    const literal = readJson<VisualDocumentInput>(path.join(options.fixtureRoot, file.evaluator.literal_source.path));
    await classify({ cell: classifierId === "C1-openai-strong" ? "oracle-literal-c1" : "oracle-literal-c2", file, variant: "oracle_literal", run, readerId: "oracle-reader", classifierId, readerInput: literal });
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
    releaseSeriesLock();
  }
}
