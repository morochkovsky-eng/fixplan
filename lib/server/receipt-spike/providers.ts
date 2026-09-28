import { adaptGoogleEnterpriseOcr, parseClassifierOutput, parseVisionReaderOutput } from "./adapters";
import type { RoleClassification, VisualDocumentInput } from "../receipt-core";
import { DOCUMENT_KINDS, DUE_SCOPES, OPTIONAL_SCOPES, ROW_ROLES, SLOT_NAMES } from "../receipt-core/types";
import { ROLE_SLOT_CONTRACT } from "../receipt-core/roles";

export type ProviderUsage = { inputTokens?: number; outputTokens?: number; pages?: number };

export type ProviderJsonResult<T> = {
  parsed: T;
  raw: unknown;
  requestedModelId: string;
  returnedModelId: string;
  latencyMs: number;
  usage: ProviderUsage;
  actualCostMicrousd: number;
  budgetChargeMicrousd: number;
  requestId?: string;
};

type Fetch = typeof fetch;
type OpenAiModel = "gpt-6-sol" | "gpt-6-luna";

export function classifierInputInstruction() {
  return `Return one RoleClassification JSON object for the following indexed literal. Use only server IDs. Allowed document kinds: ${DOCUMENT_KINDS.join(", ")}. Allowed roles: ${ROW_ROLES.join(", ")}. Allowed slots: ${SLOT_NAMES.join(", ")}. Due scopes: ${DUE_SCOPES.join(", ")}. Optional scopes: ${OPTIONAL_SCOPES.join(", ")}. Declared state: not_applicable. Affects due: include, already_in_accrual, unknown. Modes: label_value, table_columns. Required and allowed slots per role: ${JSON.stringify(ROLE_SLOT_CONTRACT)}.`;
}

function classifierInput(classifierInputJson: string) {
  return [{ role: "user", content: [
    { type: "input_text", text: classifierInputInstruction() },
    { type: "input_text", text: classifierInputJson },
  ] }];
}

const OPENAI_PRICES_MICROUSD_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "gpt-6-sol": { input: 2, output: 10 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
};
const LONG_CONTEXT_THRESHOLD = 272_000;
const REQUEST_PROTOCOL_TOKEN_ALLOWANCE = 8_192;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class OpenAiHttpError extends Error {
  readonly diagnostic: { status: number; requestId: string | null; processingMs: string | null; type: string | null; code: string | null; param: string | null; message: string | null; receivedAt: string; outcome: "provider_rejected_definitive" | "provider_outcome_unknown" };
  constructor(status: number, response: Response, raw: unknown, parseable: boolean) {
    const detail = parseable && record(raw) && record(raw.error) ? raw.error : null;
    const field = (name: string) => typeof detail?.[name] === "string" ? String(detail[name]).slice(0, name === "message" ? 2048 : 256) : null;
    const type = field("type");
    const code = field("code");
    const param = field("param");
    const definitive = Boolean(detail) && ([400, 401, 403, 404, 422].includes(status) || (status === 429 && code === "insufficient_quota"));
    super(`openai_http_${status}`);
    this.name = "OpenAiHttpError";
    this.diagnostic = {
      status, requestId: response.headers.get("x-request-id")?.slice(0, 256) ?? null,
      processingMs: response.headers.get("openai-processing-ms")?.slice(0, 32) ?? null,
      type, code, param, message: field("message"), receivedAt: new Date().toISOString(),
      outcome: definitive ? "provider_rejected_definitive" : "provider_outcome_unknown",
    };
  }
}

function requiredUsageInteger(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`openai_usage_invalid:${name}`);
  return Number(value);
}

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  return response.output.flatMap((item) => record(item) && Array.isArray(item.content) ? item.content : []).flatMap((content) =>
    record(content) && content.type === "output_text" && typeof content.text === "string" ? [content.text] : []
  ).join("");
}

function openAiCost(model: OpenAiModel, inputTokens: number, outputTokens: number) {
  const prices = OPENAI_PRICES_MICROUSD_PER_TOKEN[model];
  if (!prices) throw new Error(`unsupported_openai_price:${model}`);
  const longContext = inputTokens > LONG_CONTEXT_THRESHOLD;
  return Math.ceil(inputTokens * prices.input * (longContext ? 2 : 1) + outputTokens * prices.output * (longContext ? 1.5 : 1));
}

function openAiBudgetCharge(model: OpenAiModel, inputTokens: number, outputTokens: number) {
  const prices = OPENAI_PRICES_MICROUSD_PER_TOKEN[model];
  if (!prices) throw new Error(`unsupported_openai_price:${model}`);
  const longContext = inputTokens > LONG_CONTEXT_THRESHOLD;
  return Math.ceil(
    inputTokens * prices.input * (longContext ? 2.5 : 1.25) +
    outputTokens * prices.output * (longContext ? 1.5 : 1)
  );
}

function requestBody(options: { model: OpenAiModel; instructions: string; input: unknown; reasoningEffort: "low" | "medium"; maxOutputTokens: number }) {
  return {
    model: options.model,
    instructions: options.instructions,
    input: options.input,
    reasoning: { effort: options.reasoningEffort },
    max_output_tokens: options.maxOutputTokens,
    text: { format: { type: "json_object" } },
    store: false,
  };
}

export function openAiRequestCostUpperBoundMicrousd(options: {
  model: OpenAiModel;
  body: ReturnType<typeof requestBody>;
  imageTokenUpperBound?: number;
}) {
  const serializedBytes = Buffer.byteLength(JSON.stringify(options.body), "utf8");
  const imageTokens = Math.max(0, Math.ceil(options.imageTokenUpperBound ?? 0));
  // UTF-8 byte length is a conservative ceiling for text tokens. Image patches and
  // protocol overhead are added independently so neither can hide behind base64 size.
  const inputTokenUpperBound = serializedBytes + imageTokens + REQUEST_PROTOCOL_TOKEN_ALLOWANCE;
  const prices = OPENAI_PRICES_MICROUSD_PER_TOKEN[options.model];
  const longContext = inputTokenUpperBound > LONG_CONTEXT_THRESHOLD;
  return {
    inputTokenUpperBound,
    outputTokenUpperBound: options.body.max_output_tokens,
    maximumCostMicrousd: Math.ceil(
      inputTokenUpperBound * prices.input * (longContext ? 2.5 : 1.25) +
      options.body.max_output_tokens * prices.output * (longContext ? 1.5 : 1)
    ),
  };
}

export class OpenAiReceiptSpikeClient {
  constructor(private readonly apiKey: string, private readonly fetchImpl: Fetch = fetch, private readonly endpoint = "https://api.openai.com/v1/responses") {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for paid execution");
  }

  private async request<T>(options: {
    model: OpenAiModel;
    instructions: string;
    input: unknown;
    reasoningEffort: "low" | "medium";
    maxOutputTokens: number;
    parse: (value: unknown) => T;
    signal?: AbortSignal;
  }): Promise<ProviderJsonResult<T>> {
    const started = performance.now();
    const body = requestBody(options);
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const responseText = await response.text();
    let raw: unknown;
    let parseable = false;
    try { raw = JSON.parse(responseText); parseable = true; } catch { raw = null; }
    if (!response.ok) throw new OpenAiHttpError(response.status, response, raw, parseable);
    if (!record(raw)) throw new Error(`openai_response_invalid:${response.status}`);
    if (raw.status !== "completed") throw new Error(`openai_response_${String(raw.status ?? "unknown")}`);
    const text = outputText(raw);
    if (!text) throw new Error("openai_output_text_missing");
    if (!record(raw.usage)) throw new Error("openai_usage_missing");
    const inputTokens = requiredUsageInteger(raw.usage.input_tokens, "input_tokens");
    const outputTokens = requiredUsageInteger(raw.usage.output_tokens, "output_tokens");
    if (inputTokens === 0 || outputTokens === 0) throw new Error("openai_usage_empty");
    if (typeof raw.model !== "string" || !raw.model) throw new Error("openai_returned_model_missing");
    const returnedModelId = raw.model;
    return {
      parsed: options.parse(JSON.parse(text)),
      raw,
      requestedModelId: options.model,
      returnedModelId,
      latencyMs: Math.round(performance.now() - started),
      usage: { inputTokens, outputTokens },
      actualCostMicrousd: openAiCost(options.model, inputTokens, outputTokens),
      budgetChargeMicrousd: openAiBudgetCharge(options.model, inputTokens, outputTokens),
      requestId: response.headers.get("x-request-id")?.slice(0, 256),
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

  maximumImageCost(options: { model: "gpt-6-sol"; instructions: string; bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; width: number; height: number }) {
    const imageUrl = `data:${options.mimeType};base64,${Buffer.from(options.bytes).toString("base64")}`;
    const body = requestBody({
      model: options.model,
      instructions: options.instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: "Return the literal document as JSON." }, { type: "input_image", image_url: imageUrl, detail: "original" }] }],
      reasoningEffort: "low",
      maxOutputTokens: 12_000,
    });
    const imageTokenUpperBound = Math.ceil(options.width / 32) * Math.ceil(options.height / 32) * 2;
    return openAiRequestCostUpperBoundMicrousd({ model: options.model, body, imageTokenUpperBound });
  }

  classify(options: { model: "gpt-6-sol" | "gpt-6-luna"; instructions: string; classifierInputJson: string; reasoningEffort: "low" | "medium"; signal?: AbortSignal }) {
    return this.request<RoleClassification>({
      model: options.model,
      instructions: options.instructions,
      input: classifierInput(options.classifierInputJson),
      reasoningEffort: options.reasoningEffort,
      maxOutputTokens: 16_000,
      parse: parseClassifierOutput,
      signal: options.signal,
    });
  }

  maximumClassifierCost(options: { model: OpenAiModel; instructions: string; classifierInputJson: string; reasoningEffort: "low" | "medium" }) {
    const body = requestBody({
      model: options.model,
      instructions: options.instructions,
      input: classifierInput(options.classifierInputJson),
      reasoningEffort: options.reasoningEffort,
      maxOutputTokens: 16_000,
    });
    return openAiRequestCostUpperBoundMicrousd({ model: options.model, body });
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
    if (pages <= 0) throw new Error("google_document_ai_usage_missing");
    return {
      parsed: adaptGoogleEnterpriseOcr(raw.document),
      raw,
      requestedModelId: this.config.processorVersion,
      returnedModelId: this.config.processorVersion,
      latencyMs: Math.round(performance.now() - started),
      usage: { pages },
      actualCostMicrousd: pages * 1_500,
      budgetChargeMicrousd: pages * 1_500,
    };
  }
}
