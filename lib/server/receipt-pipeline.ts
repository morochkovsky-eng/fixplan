import "server-only";
import { OpenAIReceiptExtractor, type ReceiptProviderResult, type ReceiptTranscription, type ReceiptTranscriptionInput, type ReceiptVisionExtractor } from "@/lib/server/receipt-transcription";
import { mergeNormalizedReceipts, parseNormalizedReceipt, unresolvedReceiptFields, type NormalizedReceipt } from "@/lib/server/receipt-normalization";
import { receiptToBillPayload, validateNormalizedReceipt, type ReceiptValidation } from "@/lib/server/receipt-validation";
import { verifyReceiptEvidence } from "@/lib/server/receipt-evidence";

export const RECEIPT_PIPELINE_DEADLINE_MS = 240_000;
const RECEIPT_FALLBACK_MIN_BUDGET_MS = 45_000;

export type ReceiptPipelineAttempt = {
  stage: "transcription" | "normalization" | "due_date_transcription" | "due_date_normalization" | "fallback_transcription" | "fallback_normalization";
  provider: string;
  requestedModel: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  failureCode: string | null;
};

export type ReceiptPipelineDiagnostic =
  | { stage: "transcription" | "fallback_transcription" | "due_date_transcription"; transcription: ReceiptTranscription }
  | { stage: "normalization" | "fallback_normalization" | "due_date_normalization"; receipt: NormalizedReceipt }
  | { stage: "evidence_verification"; warnings: string[]; rejectedEntities: string[] };

export type ReceiptPipelineResult = {
  ok: boolean;
  receipt: NormalizedReceipt | null;
  validation: ReceiptValidation | null;
  billPayload: Record<string, unknown> | null;
  attempts: ReceiptPipelineAttempt[];
  fallbackUsed: boolean;
  failureCode: string | null;
};

function attempt(stage: ReceiptPipelineAttempt["stage"], requestedModel: string, result: ReceiptProviderResult<unknown>): ReceiptPipelineAttempt {
  return { stage, provider: result.provider, requestedModel, model: result.model, latencyMs: result.latencyMs, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, failureCode: result.failureCode };
}

function extractorFromEnvironment(fetchFn?: typeof fetch) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAIReceiptExtractor({
    apiKey,
    transcriptionModel: process.env.OPENAI_RECEIPT_TRANSCRIPTION_MODEL ?? "gpt-5.5-2026-04-23",
    normalizationModel: process.env.OPENAI_RECEIPT_NORMALIZATION_MODEL ?? "gpt-5.5-2026-04-23",
    fetchFn,
  });
}

export async function runReceiptPipeline(input: ReceiptTranscriptionInput, options: { extractor?: ReceiptVisionExtractor; fetchFn?: typeof fetch; deadlineMs?: number; now?: () => number; captureDiagnostic?: (diagnostic: ReceiptPipelineDiagnostic) => void } = {}): Promise<ReceiptPipelineResult> {
  const extractor = options.extractor ?? extractorFromEnvironment(options.fetchFn);
  const attempts: ReceiptPipelineAttempt[] = [];
  const now = options.now ?? Date.now;
  const deadlineAt = now() + Math.max(1, Math.min(RECEIPT_PIPELINE_DEADLINE_MS, options.deadlineMs ?? RECEIPT_PIPELINE_DEADLINE_MS));
  const remaining = () => Math.max(0, deadlineAt - now());
  const timeoutFailure = (fallbackUsed: boolean, receipt: NormalizedReceipt | null = null, validation: ReceiptValidation | null = null): ReceiptPipelineResult => ({ ok: false, receipt, validation, billPayload: null, attempts, fallbackUsed, failureCode: "pipeline_deadline_exceeded" });
  if (!remaining()) return timeoutFailure(false);
  const transcription = await extractor.transcribe(input, { timeoutMs: remaining() });
  attempts.push(attempt("transcription", extractor.transcriptionModel, transcription));
  if (!transcription.value) return { ok: false, receipt: null, validation: null, billPayload: null, attempts, fallbackUsed: false, failureCode: transcription.failureCode ?? "transcription_invalid" };
  options.captureDiagnostic?.({ stage: "transcription", transcription: transcription.value });
  if (!remaining()) return timeoutFailure(false);
  const normalized = await extractor.normalize(transcription.value, { timeoutMs: remaining() });
  attempts.push(attempt("normalization", extractor.normalizationModel, normalized));
  let receipt = parseNormalizedReceipt(normalized.value);
  if (!receipt) return { ok: false, receipt: null, validation: null, billPayload: null, attempts, fallbackUsed: false, failureCode: normalized.failureCode ?? "normalization_invalid" };
  options.captureDiagnostic?.({ stage: "normalization", receipt });

  const evidence = verifyReceiptEvidence(receipt, transcription.value);
  receipt = evidence.receipt;
  options.captureDiagnostic?.({ stage: "evidence_verification", warnings: evidence.warnings, rejectedEntities: evidence.rejectedEntities });
  let validation = validateNormalizedReceipt(receipt);
  let fallbackUsed = false;

  const shouldProcess = !(receipt.isUtilityDocument.status === "confirmed" && receipt.isUtilityDocument.value === false);
  if (shouldProcess && receipt.dueDate.value === null && input.targetedDataUrls?.length && remaining() >= RECEIPT_FALLBACK_MIN_BUDGET_MS) {
    fallbackUsed = true;
    const dueInput = { ...input, targetedDataUrls: [input.targetedDataUrls[0]], unresolvedFields: ["dueDate"], sourceRegionIds: receipt.dueDate.sourceRegionIds };
    const dueTranscription = await extractor.transcribeFallback(dueInput, { timeoutMs: remaining() });
    attempts.push(attempt("due_date_transcription", extractor.transcriptionModel, dueTranscription));
    if (dueTranscription.value) {
      options.captureDiagnostic?.({ stage: "due_date_transcription", transcription: dueTranscription.value });
      if (!remaining()) return timeoutFailure(true, receipt, validation);
      const dueNormalized = await extractor.normalize(dueTranscription.value, { timeoutMs: remaining() });
      attempts.push(attempt("due_date_normalization", extractor.normalizationModel, dueNormalized));
      const dueReceipt = parseNormalizedReceipt(dueNormalized.value);
      if (dueReceipt) {
        options.captureDiagnostic?.({ stage: "due_date_normalization", receipt: dueReceipt });
        const verifiedDue = verifyReceiptEvidence(dueReceipt, dueTranscription.value).receipt.dueDate;
        if (verifiedDue.status === "confirmed" && verifiedDue.value !== null) receipt.dueDate = verifiedDue;
        validation = validateNormalizedReceipt(receipt);
      }
    }
  }

  const unresolved = unresolvedReceiptFields(receipt).filter((item) => item.name !== "dueDate");
  if (unresolved.length && shouldProcess && remaining() >= RECEIPT_FALLBACK_MIN_BUDGET_MS) {
    fallbackUsed = true;
    const sourceRegionIds = [...new Set(unresolved.flatMap((item) => item.sourceRegionIds))];
    const fallbackTranscription = await extractor.transcribeFallback({ ...input, unresolvedFields: unresolved.map((item) => item.name), sourceRegionIds }, { timeoutMs: remaining() });
    attempts.push(attempt("fallback_transcription", extractor.transcriptionModel, fallbackTranscription));
    if (fallbackTranscription.value) {
      options.captureDiagnostic?.({ stage: "fallback_transcription", transcription: fallbackTranscription.value });
      if (!remaining()) return timeoutFailure(true, receipt, validation);
      const fallbackNormalized = await extractor.normalize(fallbackTranscription.value as ReceiptTranscription, { timeoutMs: remaining() });
      attempts.push(attempt("fallback_normalization", extractor.normalizationModel, fallbackNormalized));
      const fallbackReceipt = parseNormalizedReceipt(fallbackNormalized.value);
      if (fallbackReceipt) {
        options.captureDiagnostic?.({ stage: "fallback_normalization", receipt: fallbackReceipt });
        receipt = mergeNormalizedReceipts(receipt, verifyReceiptEvidence(fallbackReceipt, fallbackTranscription.value).receipt);
        validation = validateNormalizedReceipt(receipt);
      }
    }
  } else if (unresolved.length && shouldProcess && remaining() < RECEIPT_FALLBACK_MIN_BUDGET_MS) {
    return { ok: false, receipt: validation.receipt, validation, billPayload: null, attempts, fallbackUsed, failureCode: "pipeline_deadline_insufficient_for_fallback" };
  }
  if (!remaining()) return timeoutFailure(fallbackUsed, receipt, validation);
  return { ok: validation.ok, receipt: validation.receipt, validation, billPayload: validation.ok ? receiptToBillPayload(validation.receipt, validation) : null, attempts, fallbackUsed, failureCode: validation.ok ? null : validation.blockers.join(",") || "receipt_validation_failed" };
}
