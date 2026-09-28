import fs from "node:fs";
import path from "node:path";
import { ReceiptSpikeBudgetLedger } from "./budget";
import type { ReceiptSpikeCarryover } from "./budget";
import { OpenAiHttpError, ProviderCompletedOutputError } from "./providers";

export type BudgetedProviderResult<T> = {
  parsed: T;
  raw: unknown;
  requestedModelId: string;
  returnedModelId: string;
  latencyMs: number;
  usage: { inputTokens?: number; outputTokens?: number; pages?: number };
  actualCostMicrousd: number;
  budgetChargeMicrousd: number;
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

export function bindSeriesToPlan<T extends { planSha256: string; baselineCommit: string; integrity: Record<string, unknown> }>(file: string, metadata: T) {
  if (fs.existsSync(file)) {
    const existing = readPrivateJson<T>(file);
    if (JSON.stringify(existing) !== JSON.stringify(metadata)) throw new Error("series_plan_mismatch");
    return existing;
  }
  writePrivateJson(file, metadata);
  return metadata;
}

export function bindSeriesToLedger(runRoot: string, metadata: {
  planSha256: string;
  series: string;
  approvalId: string;
  baselineCommit: string;
  integrity: Record<string, unknown>;
  carryover?: ReceiptSpikeCarryover[];
}) {
  fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  const metadataFile = path.join(runRoot, "run.meta.json");
  const ledgerFile = path.join(runRoot, "spend-ledger.jsonl");
  const existing = fs.existsSync(metadataFile);
  if (!existing) {
    // A leftover ledger without its binding cannot establish the amount already spent.
    if (fs.existsSync(ledgerFile)) throw new Error("series_binding_missing");
    fs.writeFileSync(ledgerFile, "", { flag: "wx", mode: 0o600 });
  }
  if (!fs.existsSync(ledgerFile)) throw new Error("series_ledger_missing");
  const stat = fs.lstatSync(ledgerFile);
  if (!stat.isFile()) throw new Error("series_ledger_invalid");
  return bindSeriesToPlan(metadataFile, {
    ...metadata,
    ledgerIdentity: { device: stat.dev, inode: stat.ino },
  });
}

export async function executeBudgetedProviderCall<T, U = T>(options: {
  ledger: ReceiptSpikeBudgetLedger;
  callId: string;
  provider: string;
  reservedMaxMicrousd: number;
  artifactDirectory: string;
  requestMetadata: Record<string, unknown>;
  dispatch: () => Promise<BudgetedProviderResult<U>>;
  parseCompleted?: (value: U) => T;
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
  let completedResponse = false;
  try {
    const result = await options.dispatch();
    writePrivateJson(rawFile, result.raw);
    options.ledger.complete({
      callId: options.callId,
      actualCostMicrousd: result.actualCostMicrousd,
      budgetChargeMicrousd: result.budgetChargeMicrousd,
      requestedModelId: result.requestedModelId,
      returnedModelId: result.returnedModelId,
    });
    completedResponse = true;
    writePrivateJson(path.join(options.artifactDirectory, "response.usage.json"), {
      usage: result.usage,
      actualCostMicrousd: result.actualCostMicrousd,
      budgetChargeMicrousd: result.budgetChargeMicrousd,
      requestedModelId: result.requestedModelId,
      returnedModelId: result.returnedModelId,
      requestId: "requestId" in result ? result.requestId : undefined,
    });
    const parsed = options.parseCompleted ? options.parseCompleted(result.parsed) : result.parsed as unknown as T;
    const validated = { ...result, parsed };
    writePrivateJson(resultFile, validated);
    return { status: "completed" as const, result: validated };
  } catch (error) {
    if (completedResponse) {
      writePrivateJson(path.join(options.artifactDirectory, "error.json"), {
        code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "classifier_contract_validation_failed",
        message: error instanceof Error ? error.message.slice(0, 2048) : "completed output validation failed",
        receivedAt: new Date().toISOString(),
      });
      throw new Error("provider_completed_output_invalid");
    }
    if (error instanceof OpenAiHttpError) {
      writePrivateJson(path.join(options.artifactDirectory, "error.json"), error.diagnostic);
    }
    if (error instanceof ProviderCompletedOutputError) {
      options.ledger.complete({
        callId: options.callId,
        actualCostMicrousd: error.completed.actualCostMicrousd,
        budgetChargeMicrousd: error.completed.budgetChargeMicrousd,
        requestedModelId: error.completed.requestedModelId,
        returnedModelId: error.completed.returnedModelId,
      });
      writePrivateJson(rawFile, error.completed.raw);
      writePrivateJson(path.join(options.artifactDirectory, "response.usage.json"), {
        usage: error.completed.usage,
        actualCostMicrousd: error.completed.actualCostMicrousd,
        budgetChargeMicrousd: error.completed.budgetChargeMicrousd,
        requestedModelId: error.completed.requestedModelId,
        returnedModelId: error.completed.returnedModelId,
        requestId: error.completed.requestId,
      });
      writePrivateJson(path.join(options.artifactDirectory, "error.json"), error.diagnostic);
    }
    const state = options.ledger.snapshot();
    if (state.unresolvedCallIds.includes(options.callId) && !state.uncertainCallIds.includes(options.callId)) {
      options.ledger.markUncertain(options.callId, error instanceof OpenAiHttpError ? error.diagnostic.outcome : "provider_call_outcome_unknown");
    }
    if (error instanceof ProviderCompletedOutputError) throw new Error("provider_completed_output_invalid");
    throw error;
  }
}
