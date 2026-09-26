import fs from "node:fs";
import path from "node:path";
import { ReceiptSpikeBudgetLedger } from "./budget";

export type BudgetedProviderResult<T> = {
  parsed: T;
  raw: unknown;
  requestedModelId: string;
  returnedModelId: string;
  latencyMs: number;
  usage: { inputTokens?: number; outputTokens?: number; pages?: number };
  actualCostMicrousd: number;
};

export function writePrivateJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

export function readPrivateJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function enforceReturnedModelSeries(file: string, model: { provider: string; requestedModelId: string; returnedModelId: string }) {
  const key = `${model.provider}:${model.requestedModelId}`;
  const current = fs.existsSync(file) ? readPrivateJson<Record<string, string>>(file) : {};
  const established = current[key];
  if (established && established !== model.returnedModelId) {
    throw new Error(`returned_model_changed:${key}`);
  }
  if (!established) writePrivateJson(file, { ...current, [key]: model.returnedModelId });
  return model.returnedModelId;
}

export async function executeBudgetedProviderCall<T>(options: {
  ledger: ReceiptSpikeBudgetLedger;
  callId: string;
  provider: string;
  reservedMaxMicrousd: number;
  artifactDirectory: string;
  requestMetadata: Record<string, unknown>;
  dispatch: () => Promise<BudgetedProviderResult<T>>;
}) {
  const resultFile = path.join(options.artifactDirectory, "provider-result.json");
  const rawFile = path.join(options.artifactDirectory, "response.raw.json");
  const begin = options.ledger.begin({
    callId: options.callId,
    provider: options.provider,
    reservedMaxMicrousd: options.reservedMaxMicrousd,
  });
  if (begin.status === "already_completed") {
    if (!fs.existsSync(resultFile)) throw new Error(`completed_call_artifact_missing:${options.callId}`);
    return { status: "reused" as const, result: readPrivateJson<BudgetedProviderResult<T>>(resultFile) };
  }

  writePrivateJson(path.join(options.artifactDirectory, "request.meta.json"), options.requestMetadata);
  try {
    const result = await options.dispatch();
    writePrivateJson(rawFile, result.raw);
    writePrivateJson(resultFile, result);
    options.ledger.complete({
      callId: options.callId,
      actualCostMicrousd: result.actualCostMicrousd,
      requestedModelId: result.requestedModelId,
      returnedModelId: result.returnedModelId,
    });
    return { status: "completed" as const, result };
  } catch (error) {
    const state = options.ledger.snapshot();
    if (state.unresolvedCallIds.includes(options.callId) && !state.uncertainCallIds.includes(options.callId)) {
      options.ledger.markUncertain(options.callId, "provider_call_outcome_unknown");
    }
    throw error;
  }
}
