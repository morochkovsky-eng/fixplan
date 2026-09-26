import { adaptGoogleEnterpriseOcr, parseClassifierOutput, parseVisionReaderOutput } from "./adapters";
import type { RoleClassification, VisualDocumentInput } from "../receipt-core";

export type ProviderUsage = { inputTokens?: number; outputTokens?: number; pages?: number };

export type ProviderJsonResult<T> = {
  parsed: T;
  raw: unknown;
  requestedModelId: string;
  returnedModelId: string;
  latencyMs: number;
  usage: ProviderUsage;
  actualCostMicrousd: number;
};

type Fetch = typeof fetch;

const OPENAI_PRICES_MICROUSD_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "gpt-6-sol": { input: 2, output: 10 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integer(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  return response.output.flatMap((item) => record(item) && Array.isArray(item.content) ? item.content : []).flatMap((content) =>
    record(content) && content.type === "output_text" && typeof content.text === "string" ? [content.text] : []
  ).join("");
}

function openAiCost(model: string, inputTokens: number, outputTokens: number) {
  const prices = OPENAI_PRICES_MICROUSD_PER_TOKEN[model];
  if (!prices) throw new Error(`unsupported_openai_price:${model}`);
  return Math.ceil(inputTokens * prices.input + outputTokens * prices.output);
}

export class OpenAiReceiptSpikeClient {
  constructor(private readonly apiKey: string, private readonly fetchImpl: Fetch = fetch, private readonly endpoint = "https://api.openai.com/v1/responses") {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for paid execution");
  }

  private async request<T>(options: {
    model: "gpt-6-sol" | "gpt-6-luna";
    instructions: string;
    input: unknown;
    reasoningEffort: "low" | "medium";
    maxOutputTokens: number;
    parse: (value: unknown) => T;
    signal?: AbortSignal;
  }): Promise<ProviderJsonResult<T>> {
    const started = performance.now();
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        instructions: options.instructions,
        input: options.input,
        reasoning: { effort: options.reasoningEffort },
        max_output_tokens: options.maxOutputTokens,
        text: { format: { type: "json_object" } },
        store: false,
      }),
      signal: options.signal,
    });
    const raw: unknown = await response.json();
    if (!response.ok || !record(raw)) throw new Error(`openai_http_${response.status}`);
    if (raw.status !== "completed") throw new Error(`openai_response_${String(raw.status ?? "unknown")}`);
    const text = outputText(raw);
    if (!text) throw new Error("openai_output_text_missing");
    const usage = record(raw.usage) ? raw.usage : {};
    const inputTokens = integer(usage.input_tokens);
    const outputTokens = integer(usage.output_tokens);
    const returnedModelId = typeof raw.model === "string" ? raw.model : options.model;
    return {
      parsed: options.parse(JSON.parse(text)),
      raw,
      requestedModelId: options.model,
      returnedModelId,
      latencyMs: Math.round(performance.now() - started),
      usage: { inputTokens, outputTokens },
      actualCostMicrousd: openAiCost(options.model, inputTokens, outputTokens),
    };
  }

  readImage(options: { model: "gpt-6-sol"; instructions: string; bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; signal?: AbortSignal }) {
    const imageUrl = `data:${options.mimeType};base64,${Buffer.from(options.bytes).toString("base64")}`;
    return this.request<VisualDocumentInput>({
      model: options.model,
      instructions: options.instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: "Return the literal document as JSON." }, { type: "input_image", image_url: imageUrl, detail: "original" }] }],
      reasoningEffort: "low",
      maxOutputTokens: 12_000,
      parse: parseVisionReaderOutput,
      signal: options.signal,
    });
  }

  classify(options: { model: "gpt-6-sol" | "gpt-6-luna"; instructions: string; classifierInputJson: string; reasoningEffort: "low" | "medium"; signal?: AbortSignal }) {
    return this.request<RoleClassification>({
      model: options.model,
      instructions: options.instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: options.classifierInputJson }] }],
      reasoningEffort: options.reasoningEffort,
      maxOutputTokens: 16_000,
      parse: parseClassifierOutput,
      signal: options.signal,
    });
  }
}

export class GoogleEnterpriseOcrClient {
  private readonly endpoint: string;

  constructor(private readonly config: {
    accessToken: string;
    projectId: string;
    location: string;
    processorId: string;
    processorVersion: string;
  }, private readonly fetchImpl: Fetch = fetch) {
    for (const [key, value] of Object.entries(config)) if (!value) throw new Error(`${key} is required for Google OCR execution`);
    if (!/^[a-z0-9-]+$/u.test(config.location)) throw new Error("Google OCR location is invalid");
    const base = `https://${config.location}-documentai.googleapis.com/v1`;
    this.endpoint = `${base}/projects/${encodeURIComponent(config.projectId)}/locations/${encodeURIComponent(config.location)}/processors/${encodeURIComponent(config.processorId)}/processorVersions/${encodeURIComponent(config.processorVersion)}:process`;
  }

  async read(options: { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; signal?: AbortSignal }): Promise<ProviderJsonResult<VisualDocumentInput>> {
    const started = performance.now();
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        rawDocument: { content: Buffer.from(options.bytes).toString("base64"), mimeType: options.mimeType },
        processOptions: { ocrConfig: { enableImageQualityScores: true } },
      }),
      signal: options.signal,
    });
    const raw: unknown = await response.json();
    if (!response.ok || !record(raw) || !record(raw.document)) throw new Error(`google_document_ai_http_${response.status}`);
    const pages = Array.isArray(raw.document.pages) ? raw.document.pages.length : 0;
    return {
      parsed: adaptGoogleEnterpriseOcr(raw.document),
      raw,
      requestedModelId: this.config.processorVersion,
      returnedModelId: this.config.processorVersion,
      latencyMs: Math.round(performance.now() - started),
      usage: { pages },
      actualCostMicrousd: pages * 1_500,
    };
  }
}
