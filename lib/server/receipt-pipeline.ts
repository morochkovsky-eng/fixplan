import "server-only";
import { OpenAIReceiptExtractor, type ReceiptProviderResult, type ReceiptTranscription, type ReceiptTranscriptionInput, type ReceiptVisionExtractor } from "@/lib/server/receipt-transcription";
import { mergeNormalizedReceipts, parseNormalizedReceipt, unresolvedReceiptFields, type NormalizedReceipt } from "@/lib/server/receipt-normalization";
import { receiptToBillPayload, validateNormalizedReceipt, type ReceiptValidation } from "@/lib/server/receipt-validation";

export type ReceiptPipelineAttempt = {
  stage: "transcription" | "normalization" | "fallback_transcription" | "fallback_normalization";
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  failureCode: string | null;
};

export type ReceiptPipelineResult = {
  ok: boolean;
  receipt: NormalizedReceipt | null;
  validation: ReceiptValidation | null;
  billPayload: Record<string, unknown> | null;
  attempts: ReceiptPipelineAttempt[];
  fallbackUsed: boolean;
  failureCode: string | null;
};

function attempt(stage: ReceiptPipelineAttempt["stage"], result: ReceiptProviderResult<unknown>): ReceiptPipelineAttempt {
  return { stage, provider: result.provider, model: result.model, latencyMs: result.latencyMs, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, failureCode: result.failureCode };
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

export async function runReceiptPipeline(input: ReceiptTranscriptionInput, options: { extractor?: ReceiptVisionExtractor; fetchFn?: typeof fetch } = {}): Promise<ReceiptPipelineResult> {
  const extractor = options.extractor ?? extractorFromEnvironment(options.fetchFn);
  const attempts: ReceiptPipelineAttempt[] = [];
  const transcription = await extractor.transcribe(input);
  attempts.push(attempt("transcription", transcription));
  if (!transcription.value) return { ok: false, receipt: null, validation: null, billPayload: null, attempts, fallbackUsed: false, failureCode: transcription.failureCode ?? "transcription_invalid" };
  const normalized = await extractor.normalize(transcription.value);
  attempts.push(attempt("normalization", normalized));
  let receipt = parseNormalizedReceipt(normalized.value);
  if (!receipt) return { ok: false, receipt: null, validation: null, billPayload: null, attempts, fallbackUsed: false, failureCode: normalized.failureCode ?? "normalization_invalid" };

  let validation = validateNormalizedReceipt(receipt);
  const unresolved = unresolvedReceiptFields(receipt);
  let fallbackUsed = false;
  if (unresolved.length && !(receipt.isUtilityDocument.status === "confirmed" && receipt.isUtilityDocument.value === false)) {
    fallbackUsed = true;
    const sourceRegionIds = [...new Set(unresolved.flatMap((item) => item.sourceRegionIds))];
    const fallbackTranscription = await extractor.transcribeFallback({ ...input, unresolvedFields: unresolved.map((item) => item.name), sourceRegionIds });
    attempts.push(attempt("fallback_transcription", fallbackTranscription));
    if (fallbackTranscription.value) {
      const fallbackNormalized = await extractor.normalize(fallbackTranscription.value as ReceiptTranscription);
      attempts.push(attempt("fallback_normalization", fallbackNormalized));
      const fallbackReceipt = parseNormalizedReceipt(fallbackNormalized.value);
      if (fallbackReceipt) {
        receipt = mergeNormalizedReceipts(receipt, fallbackReceipt);
        validation = validateNormalizedReceipt(receipt);
      }
    }
  }
  return { ok: validation.ok, receipt: validation.receipt, validation, billPayload: validation.ok ? receiptToBillPayload(validation.receipt, validation) : null, attempts, fallbackUsed, failureCode: validation.ok ? null : validation.blockers.join(",") || "receipt_validation_failed" };
}
