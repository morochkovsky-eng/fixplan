import fs from "node:fs";
import path from "node:path";

export const RECEIPT_SPIKE_HARD_CAP_MICROUSD = 12_000_000;

type LedgerStarted = {
  type: "started";
  callId: string;
  at: string;
  provider: string;
  reservedMaxMicrousd: number;
};

type LedgerCompleted = {
  type: "completed";
  callId: string;
  at: string;
  actualCostMicrousd: number;
  budgetChargeMicrousd: number;
  requestedModelId: string;
  returnedModelId: string;
};

type LedgerUncertain = {
  type: "uncertain";
  callId: string;
  at: string;
  reasonCode: string;
};

export type BudgetLedgerEntry = LedgerStarted | LedgerCompleted | LedgerUncertain;

export class ReceiptSpikeBudgetError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ReceiptSpikeBudgetError";
  }
}

function acquireDirectoryLock(directory: string, code: string) {
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
    fs.writeFileSync(path.join(directory, "owner.json"), `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ReceiptSpikeBudgetError(code, `exclusive lock is already held: ${directory}`);
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fs.rmSync(directory, { recursive: true, force: true });
  };
}

export function acquireReceiptSpikeSeriesLock(runRoot: string) {
  fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  return acquireDirectoryLock(path.join(runRoot, ".series.lock"), "series_locked");
}

function nonNegativeInteger(value: unknown, name: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ReceiptSpikeBudgetError("invalid_ledger", `${name} must be a non-negative safe integer`);
  return Number(value);
}

function parseEntry(value: unknown, line: number): BudgetLedgerEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReceiptSpikeBudgetError("invalid_ledger", `line ${line} is not an object`);
  const entry = value as Record<string, unknown>;
  if (typeof entry.callId !== "string" || !entry.callId || typeof entry.at !== "string") {
    throw new ReceiptSpikeBudgetError("invalid_ledger", `line ${line} has no call identity`);
  }
  if (entry.type === "started") {
    if (typeof entry.provider !== "string" || !entry.provider) throw new ReceiptSpikeBudgetError("invalid_ledger", `line ${line} has no provider`);
    return { type: "started", callId: entry.callId, at: entry.at, provider: entry.provider, reservedMaxMicrousd: nonNegativeInteger(entry.reservedMaxMicrousd, "reservedMaxMicrousd") };
  }
  if (entry.type === "completed") {
    if (typeof entry.requestedModelId !== "string" || typeof entry.returnedModelId !== "string") throw new ReceiptSpikeBudgetError("invalid_ledger", `line ${line} has no model IDs`);
    return {
      type: "completed",
      callId: entry.callId,
      at: entry.at,
      actualCostMicrousd: nonNegativeInteger(entry.actualCostMicrousd, "actualCostMicrousd"),
      budgetChargeMicrousd: nonNegativeInteger(entry.budgetChargeMicrousd, "budgetChargeMicrousd"),
      requestedModelId: entry.requestedModelId,
      returnedModelId: entry.returnedModelId,
    };
  }
  if (entry.type === "uncertain") {
    if (typeof entry.reasonCode !== "string" || !entry.reasonCode) throw new ReceiptSpikeBudgetError("invalid_ledger", `line ${line} has no reason code`);
    return { type: "uncertain", callId: entry.callId, at: entry.at, reasonCode: entry.reasonCode };
  }
  throw new ReceiptSpikeBudgetError("invalid_ledger", `line ${line} has an unsupported type`);
}

function parseJsonLine(line: string, index: number) {
  try {
    return parseEntry(JSON.parse(line), index + 1);
  } catch (error) {
    if (error instanceof ReceiptSpikeBudgetError) throw error;
    throw new ReceiptSpikeBudgetError("invalid_ledger", `line ${index + 1} is not valid JSON`);
  }
}

export class ReceiptSpikeBudgetLedger {
  private entries: BudgetLedgerEntry[];

  constructor(private readonly file: string, readonly hardCapMicrousd = RECEIPT_SPIKE_HARD_CAP_MICROUSD) {
    if (!Number.isSafeInteger(hardCapMicrousd) || hardCapMicrousd <= 0 || hardCapMicrousd > RECEIPT_SPIKE_HARD_CAP_MICROUSD) {
      throw new ReceiptSpikeBudgetError("invalid_budget_cap", "budget cap must be a positive safe integer no greater than the repository hard cap");
    }
    this.entries = this.read();
  }

  private read() {
    if (!fs.existsSync(this.file)) return [];
    return fs.readFileSync(this.file, "utf8").split("\n").filter(Boolean).map(parseJsonLine);
  }

  private locked<T>(callback: () => T) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const release = acquireDirectoryLock(`${this.file}.lock`, "ledger_locked");
    try {
      this.entries = this.read();
      return callback();
    } finally {
      release();
    }
  }

  private append(entry: BudgetLedgerEntry) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const descriptor = fs.openSync(this.file, "a", 0o600);
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.chmodSync(this.file, 0o600);
    this.entries.push(entry);
  }

  private summarize() {
    const started = new Map<string, LedgerStarted>();
    const completed = new Map<string, LedgerCompleted>();
    const uncertain = new Map<string, LedgerUncertain>();
    for (const entry of this.entries) {
      if (entry.type === "started") started.set(entry.callId, entry);
      if (entry.type === "completed") completed.set(entry.callId, entry);
      if (entry.type === "uncertain") uncertain.set(entry.callId, entry);
    }
    const unresolved = [...started.values()].filter((entry) => !completed.has(entry.callId));
    const actualCostMicrousd = [...completed.values()].reduce((sum, entry) => sum + entry.actualCostMicrousd, 0);
    const budgetChargedMicrousd = [...completed.values()].reduce((sum, entry) => sum + entry.budgetChargeMicrousd, 0);
    const heldMicrousd = unresolved.reduce((sum, entry) => sum + entry.reservedMaxMicrousd, 0);
    return {
      actualCostMicrousd,
      budgetChargedMicrousd,
      spentMicrousd: budgetChargedMicrousd,
      heldMicrousd,
      committedMicrousd: budgetChargedMicrousd + heldMicrousd,
      remainingMicrousd: this.hardCapMicrousd - budgetChargedMicrousd - heldMicrousd,
      completedCallIds: [...completed.keys()].sort(),
      unresolvedCallIds: unresolved.map((entry) => entry.callId).sort(),
      uncertainCallIds: [...uncertain.keys()].filter((callId) => !completed.has(callId)).sort(),
    };
  }

  snapshot() {
    return this.locked(() => this.summarize());
  }

  begin(call: { callId: string; provider: string; reservedMaxMicrousd: number }) {
    return this.locked(() => {
      if (!call.callId || !call.provider) throw new ReceiptSpikeBudgetError("invalid_call", "callId and provider are required");
      const reserved = nonNegativeInteger(call.reservedMaxMicrousd, "reservedMaxMicrousd");
      const state = this.summarize();
      if (state.completedCallIds.includes(call.callId)) return { status: "already_completed" as const, state };
      if (state.unresolvedCallIds.length) {
        throw new ReceiptSpikeBudgetError("unresolved_provider_call", `manual audit required before continuing; unresolved call: ${state.unresolvedCallIds[0]}`);
      }
      if (state.committedMicrousd + reserved > this.hardCapMicrousd) {
        throw new ReceiptSpikeBudgetError("budget_would_be_exceeded", `call ${call.callId} was stopped before dispatch`);
      }
      this.append({ type: "started", callId: call.callId, provider: call.provider, reservedMaxMicrousd: reserved, at: new Date().toISOString() });
      return { status: "started" as const, state: this.summarize() };
    });
  }

  complete(call: { callId: string; actualCostMicrousd: number; budgetChargeMicrousd: number; requestedModelId: string; returnedModelId: string }) {
    return this.locked(() => {
      const actual = nonNegativeInteger(call.actualCostMicrousd, "actualCostMicrousd");
      const budgetCharge = nonNegativeInteger(call.budgetChargeMicrousd, "budgetChargeMicrousd");
      if (budgetCharge < actual) {
        throw new ReceiptSpikeBudgetError("invalid_budget_charge", "budget charge cannot be lower than the usage-derived cost");
      }
      const started = [...this.entries].reverse().find((entry): entry is LedgerStarted => entry.type === "started" && entry.callId === call.callId);
      if (!started) throw new ReceiptSpikeBudgetError("call_not_started", `call ${call.callId} has no reservation`);
      if (this.summarize().completedCallIds.includes(call.callId)) throw new ReceiptSpikeBudgetError("call_already_completed", `call ${call.callId} is already complete`);
      if (budgetCharge > started.reservedMaxMicrousd) {
        this.append({ type: "uncertain", callId: call.callId, at: new Date().toISOString(), reasonCode: "actual_cost_exceeded_reservation" });
        throw new ReceiptSpikeBudgetError("reservation_exceeded", `call ${call.callId} exceeded its reserved maximum`);
      }
      this.append({
        type: "completed",
        callId: call.callId,
        at: new Date().toISOString(),
        actualCostMicrousd: actual,
        budgetChargeMicrousd: budgetCharge,
        requestedModelId: call.requestedModelId,
        returnedModelId: call.returnedModelId,
      });
      return this.summarize();
    });
  }

  markUncertain(callId: string, reasonCode: string) {
    return this.locked(() => {
      this.append({ type: "uncertain", callId, reasonCode, at: new Date().toISOString() });
      return this.summarize();
    });
  }
}

export function validateReceiptSpikeApproval(value: unknown, options: { planSha256: string; series: string; now?: Date }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReceiptSpikeBudgetError("invalid_approval", "approval must be an object");
  const approval = value as Record<string, unknown>;
  if (approval.schemaVersion !== "receipt-spike-approval-v2" || approval.approved !== true) throw new ReceiptSpikeBudgetError("approval_missing", "explicit receipt spike approval is required");
  if (approval.planSha256 !== options.planSha256) throw new ReceiptSpikeBudgetError("approval_plan_mismatch", "approval does not match this exact plan");
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(options.series) || approval.series !== options.series) throw new ReceiptSpikeBudgetError("approval_series_mismatch", "approval is restricted to one series");
  if (typeof approval.approvalId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(approval.approvalId)) throw new ReceiptSpikeBudgetError("invalid_approval_id", "approvalId must be a unique UUID v4");
  if (approval.maximumAuthorizedSpendMicrousd !== RECEIPT_SPIKE_HARD_CAP_MICROUSD) throw new ReceiptSpikeBudgetError("approval_cap_mismatch", "approval must use the repository hard cap");
  if (typeof approval.expiresAt !== "string" || !Number.isFinite(Date.parse(approval.expiresAt))) throw new ReceiptSpikeBudgetError("invalid_approval", "approval expiry is invalid");
  if (Date.parse(approval.expiresAt) <= (options.now ?? new Date()).getTime()) throw new ReceiptSpikeBudgetError("approval_expired", "approval has expired");
  return {
    schemaVersion: "receipt-spike-approval-v2" as const,
    approved: true as const,
    approvalId: approval.approvalId,
    series: options.series,
    planSha256: options.planSha256,
    maximumAuthorizedSpendMicrousd: RECEIPT_SPIKE_HARD_CAP_MICROUSD,
    expiresAt: approval.expiresAt,
  };
}

export function readReceiptSpikeApproval(file: string, options: { planSha256: string; series: string; now?: Date }) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new ReceiptSpikeBudgetError("invalid_approval_file", "approval path must be a regular file");
  if ((stat.mode & 0o077) !== 0) throw new ReceiptSpikeBudgetError("unsafe_approval_permissions", "approval file must be readable only by its owner (mode 600)");
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new ReceiptSpikeBudgetError("invalid_approval", "approval file is not valid JSON");
  }
  return validateReceiptSpikeApproval(value, options);
}
