import "server-only";

export type ReceiptRegionKind =
  | "heading"
  | "paragraph"
  | "key_value"
  | "table"
  | "total"
  | "meter"
  | "reference";

export type ReceiptRowKind = "section_header" | "charge" | "subtotal" | "grand_total" | "reference";

export type ReceiptEvidenceRegion = {
  id: string;
  page: number;
  kind: ReceiptRegionKind | "table_header" | "table_row" | "table_cell";
  sectionType: "identity" | "billing_period" | "financial_summary" | "service_table" | "meter_table" | "optional_charges" | "reference" | "other";
  label: string | null;
  value: string | null;
  rawText: string | null;
  bbox: { x: number; y: number; width: number; height: number };
  allowsMultipleEntities: boolean;
};

export type ReceiptTextRegion = {
  id: string;
  page: number;
  kind: ReceiptRegionKind;
  rawText: string | null;
};

export type ReceiptTable = {
  id: string;
  page: number;
  title: string | null;
  headers: Array<{ id: string; rawText: string | null }>;
  rows: Array<{
    id: string;
    kind: ReceiptRowKind;
    cells: Array<{ headerId: string; rawText: string | null }>;
  }>;
};

export type ReceiptTranscription = {
  pages: Array<{
    page: number;
    rawText: string | null;
    sections: Array<{ id: string; title: string | null; regionIds: string[] }>;
  }>;
  regions: ReceiptTextRegion[];
  keyValues: Array<{ id: string; page: number; label: string | null; value: string | null; rawText: string | null }>;
  tables: ReceiptTable[];
  totals: Array<{ id: string; page: number; label: string | null; value: string | null; rawText: string | null }>;
  meters: Array<{ id: string; page: number; rawText: string | null; fields: Array<{ label: string | null; value: string | null }> }>;
  evidence?: ReceiptEvidenceRegion[];
};

export type ReceiptModelUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type ReceiptProviderResult<T> = {
  provider: string;
  model: string;
  value: T | null;
  usage: ReceiptModelUsage;
  latencyMs: number;
  failureCode: string | null;
  responseId: string | null;
};

export type ReceiptTranscriptionInput = {
  dataUrl: string;
  filename: string;
  mimeType: string;
  targetedDataUrls?: string[];
};

export interface ReceiptVisionExtractor {
  readonly provider: string;
  readonly transcriptionModel: string;
  readonly normalizationModel: string;
  transcribe(input: ReceiptTranscriptionInput, options?: ReceiptRequestOptions): Promise<ReceiptProviderResult<ReceiptTranscription>>;
  transcribeFallback(input: ReceiptTranscriptionInput & { unresolvedFields: string[]; sourceRegionIds: string[] }, options?: ReceiptRequestOptions): Promise<ReceiptProviderResult<ReceiptTranscription>>;
  normalize(transcription: ReceiptTranscription, options?: ReceiptRequestOptions): Promise<ReceiptProviderResult<unknown>>;
}

export type ReceiptRequestOptions = { timeoutMs?: number };

const stringOrNull = { anyOf: [{ type: "string" }, { type: "null" }] };

export const receiptTranscriptionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pages", "regions", "keyValues", "tables", "totals", "meters", "evidence"],
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["page", "rawText", "sections"],
        properties: {
          page: { type: "integer", minimum: 1 }, rawText: stringOrNull,
          sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "regionIds"], properties: { id: { type: "string" }, title: stringOrNull, regionIds: { type: "array", items: { type: "string" } } } } },
        },
      },
    },
    regions: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "page", "kind", "rawText"], properties: { id: { type: "string" }, page: { type: "integer", minimum: 1 }, kind: { type: "string", enum: ["heading", "paragraph", "key_value", "table", "total", "meter", "reference"] }, rawText: stringOrNull } },
    },
    keyValues: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "page", "label", "value", "rawText"], properties: { id: { type: "string" }, page: { type: "integer", minimum: 1 }, label: stringOrNull, value: stringOrNull, rawText: stringOrNull } },
    },
    tables: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["id", "page", "title", "headers", "rows"],
        properties: {
          id: { type: "string" }, page: { type: "integer", minimum: 1 }, title: stringOrNull,
          headers: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "rawText"], properties: { id: { type: "string" }, rawText: stringOrNull } } },
          rows: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["id", "kind", "cells"],
              properties: {
                id: { type: "string" }, kind: { type: "string", enum: ["section_header", "charge", "subtotal", "grand_total", "reference"] },
                cells: { type: "array", items: { type: "object", additionalProperties: false, required: ["headerId", "rawText"], properties: { headerId: { type: "string" }, rawText: stringOrNull } } },
              },
            },
          },
        },
      },
    },
    totals: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "page", "label", "value", "rawText"], properties: { id: { type: "string" }, page: { type: "integer", minimum: 1 }, label: stringOrNull, value: stringOrNull, rawText: stringOrNull } },
    },
    meters: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "page", "rawText", "fields"], properties: { id: { type: "string" }, page: { type: "integer", minimum: 1 }, rawText: stringOrNull, fields: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: stringOrNull, value: stringOrNull } } } } },
    },
    evidence: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "page", "kind", "sectionType", "label", "value", "rawText", "bbox", "allowsMultipleEntities"],
        properties: {
          id: { type: "string" },
          page: { type: "integer", minimum: 1 },
          kind: { type: "string", enum: ["heading", "paragraph", "key_value", "table", "total", "meter", "reference", "table_header", "table_row", "table_cell"] },
          sectionType: { type: "string", enum: ["identity", "billing_period", "financial_summary", "service_table", "meter_table", "optional_charges", "reference", "other"] },
          label: stringOrNull,
          value: stringOrNull,
          rawText: stringOrNull,
          bbox: {
            type: "object", additionalProperties: false, required: ["x", "y", "width", "height"],
            properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 }, width: { type: "number", minimum: 0, maximum: 1 }, height: { type: "number", minimum: 0, maximum: 1 } },
          },
          allowsMultipleEntities: { type: "boolean" },
        },
      },
    },
  },
} as const;

export const receiptTranscriptionPrompt = `Transcribe only the attached utility document literally. Do not interpret balances, decide which total is payable, classify optional services, reconcile arithmetic, or repair OCR text. Return null when text is genuinely unreadable. Preserve printed punctuation, signs, decimal separators, headings, labels and values. Assign stable region IDs. For every table preserve original headers and cells and classify each row only by visual role: section_header, charge, subtotal, grand_total or reference. Section headings such as коммунальные услуги, жилищные услуги and прочие are not charge rows. Include every page, totals block and meter block.

Also return a flat evidence array. Every literal label and value that could support a normalized fact must have page, normalized bbox coordinates (0..1), visual kind, sectionType, literal label, literal value and rawText. An evidence ID must identify exactly one visual region. Set allowsMultipleEntities=true only when the printed region visibly contains a composite row that legitimately supports multiple semantic fields. Blank meter cells have value=null. Normatives, reference values and section headings must retain their true section/type; never relabel them as readings or charges. Do not extract personal names, bank details or QR payloads.`;

type ResponsesPayload = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

function outputText(payload: ResponsesPayload) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  return (payload.output ?? []).flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("").trim();
}

function usage(payload: ResponsesPayload): ReceiptModelUsage {
  return {
    inputTokens: payload.usage?.input_tokens ?? null,
    outputTokens: payload.usage?.output_tokens ?? null,
    totalTokens: payload.usage?.total_tokens ?? null,
  };
}

export class OpenAIReceiptExtractor implements ReceiptVisionExtractor {
  readonly provider = "openai";
  readonly transcriptionModel: string;
  readonly normalizationModel: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { apiKey: string; transcriptionModel: string; normalizationModel: string; fetchFn?: typeof fetch }) {
    this.apiKey = options.apiKey;
    this.transcriptionModel = options.transcriptionModel;
    this.normalizationModel = options.normalizationModel;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async transcribe(input: ReceiptTranscriptionInput, options?: ReceiptRequestOptions) {
    return this.requestTranscription(input, receiptTranscriptionPrompt, false, options);
  }

  async transcribeFallback(input: ReceiptTranscriptionInput & { unresolvedFields: string[]; sourceRegionIds: string[] }, options?: ReceiptRequestOptions) {
    const scope = `This is the only fallback pass. Re-transcribe only unresolved fields: ${input.unresolvedFields.join(", ") || "none"}. Relevant first-pass region IDs: ${input.sourceRegionIds.join(", ") || "none"}. Do not repeat or assume first-pass semantic values. Every returned value must be visibly supported by the current document.`;
    return this.requestTranscription({ ...input, dataUrl: input.dataUrl }, `${receiptTranscriptionPrompt}\n\n${scope}`, true, options);
  }

  async normalize(transcription: ReceiptTranscription, options?: ReceiptRequestOptions): Promise<ReceiptProviderResult<unknown>> {
    const { receiptNormalizationPrompt, receiptNormalizationSchema } = await import("@/lib/server/receipt-normalization");
    return this.requestJson(this.normalizationModel, receiptNormalizationPrompt, [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(transcription) }] }], "receipt_semantic_normalization", receiptNormalizationSchema, 14_000, options);
  }

  private async requestTranscription(input: ReceiptTranscriptionInput, instructions: string, fallback = false, options?: ReceiptRequestOptions) {
    const primary = input.mimeType.startsWith("image/")
      ? { type: "input_image", image_url: input.dataUrl, detail: "high" }
      : { type: "input_file", filename: input.filename, file_data: input.dataUrl, detail: "auto" };
    const targeted = fallback ? (input.targetedDataUrls ?? []).map((imageUrl) => ({ type: "input_image", image_url: imageUrl, detail: "high" })) : [];
    const visualInputs = fallback && targeted.length ? targeted : [primary];
    return this.requestJson(this.transcriptionModel, instructions, [{ role: "user", content: [{ type: "input_text", text: "Transcribe this document." }, ...visualInputs] }], "receipt_visual_transcription", receiptTranscriptionSchema, 14_000, options) as Promise<ReceiptProviderResult<ReceiptTranscription>>;
  }

  private async requestJson(model: string, instructions: string, input: unknown, name: string, schema: unknown, maxOutputTokens: number, options?: ReceiptRequestOptions): Promise<ReceiptProviderResult<unknown>> {
    const started = Date.now();
    try {
      const response = await this.fetchFn("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model, instructions, input, text: { format: { type: "json_schema", name, strict: true, schema } }, max_output_tokens: maxOutputTokens }),
        signal: AbortSignal.timeout(Math.max(1, Math.min(240_000, options?.timeoutMs ?? 240_000))),
      });
      if (!response.ok) {
        let providerCode = "";
        try {
          const failure = await response.json() as { error?: { code?: string } };
          providerCode = String(failure.error?.code ?? "").replace(/[^a-z0-9_]/giu, "").slice(0, 64);
        } catch {
          // Provider response bodies are optional and never logged verbatim.
        }
        return { provider: this.provider, model, value: null, usage: { inputTokens: null, outputTokens: null, totalTokens: null }, latencyMs: Date.now() - started, failureCode: `http_${response.status}${providerCode ? `_${providerCode}` : ""}`, responseId: null };
      }
      const payload = await response.json() as ResponsesPayload;
      const text = outputText(payload);
      if (!text) return { provider: this.provider, model: payload.model ?? model, value: null, usage: usage(payload), latencyMs: Date.now() - started, failureCode: "empty_output", responseId: payload.id ?? null };
      try {
        return { provider: this.provider, model: payload.model ?? model, value: JSON.parse(text), usage: usage(payload), latencyMs: Date.now() - started, failureCode: null, responseId: payload.id ?? null };
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return { provider: this.provider, model: payload.model ?? model, value: null, usage: usage(payload), latencyMs: Date.now() - started, failureCode: "invalid_json", responseId: payload.id ?? null };
      }
    } catch (error) {
      const failureCode = error instanceof DOMException && error.name === "TimeoutError"
        ? "timeout"
        : "request_failed";
      return { provider: this.provider, model, value: null, usage: { inputTokens: null, outputTokens: null, totalTokens: null }, latencyMs: Date.now() - started, failureCode, responseId: null };
    }
  }
}
