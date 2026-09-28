import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return nextResolve(specifier, context);
} });
await import("tsx/esm");
const budget = await import("../lib/server/receipt-spike/budget.ts");
const runner = await import("../lib/server/receipt-spike/runner.ts");
const providers = await import("../lib/server/receipt-spike/providers.ts");
const adapters = await import("../lib/server/receipt-spike/adapters.ts");
const classifierSchema = await import("../lib/server/receipt-spike/classifier-schema.ts");
const matrix = await import("../lib/server/receipt-spike/matrix-runner.ts");
const { buildReceiptSpikePlan, canonicalJson } = await import("../scripts/receipt-spike/plan-lib.mjs");
const approvalPlan = await import("../scripts/receipt-spike/approval-plan.mjs");

const fixtureRoot = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "spike-manifest.json"), "utf8"));
const temporary = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `homory-${name}-`));
const completed = (actualCostMicrousd = 100, budgetChargeMicrousd = actualCostMicrousd) => ({
  parsed: { ok: true },
  raw: { id: "synthetic-response" },
  requestedModelId: "requested",
  returnedModelId: "returned",
  latencyMs: 5,
  usage: { inputTokens: 10, outputTokens: 2 },
  actualCostMicrousd,
  budgetChargeMicrousd,
});
const approvalId = "e7bb7b70-cd88-462f-8aa7-45d380b13142";

test("receipt spike plan fingerprint and matrix schedule are stable and complete", () => {
  const first = approvalPlan.buildApprovedReceiptSpikePlan();
  const second = approvalPlan.buildApprovedReceiptSpikePlan();
  assert.equal(first.planSha256, second.planSha256);
  assert.match(first.integrity.manifestSha256, /^[a-f0-9]{64}$/);
  assert.match(first.integrity.readerPromptSha256, /^[a-f0-9]{64}$/);
  const unsignedPlan = buildReceiptSpikePlan();
  const changedPrompt = structuredClone(unsignedPlan);
  changedPrompt.integrity.readerPromptSha256 = "0".repeat(64);
  assert.notEqual(approvalPlan.bindReceiptSpikePlanner(changedPrompt).planSha256, first.planSha256);
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  const schedule = matrix.buildReceiptSpikeSchedule(manifest);
  assert.equal(schedule.filter((step) => step.kind !== "local_reader").length, 250);
  assert.equal(schedule.filter((step) => step.provider === "google-document-ai").length, 0);
  assert.equal(schedule.filter((step) => step.kind === "local_reader").length, 10);
  assert.equal(schedule.filter((step) => step.cell === "r1-reuse-c2" && step.kind === "provider_reader").length, 0);
  assert.equal(first.includeR2, false);
  assert.equal(first.totals.openAiCalls, 250);
  assert.equal(first.totals.googleDocumentAiCalls, 0);
});

test("R2 is an explicit separately fingerprinted matrix choice", () => {
  const initial = approvalPlan.buildApprovedReceiptSpikePlan();
  const withR2 = approvalPlan.buildApprovedReceiptSpikePlan({ includeR2: true });
  assert.notEqual(initial.planSha256, withR2.planSha256);
  assert.equal(withR2.totals.providerCalls, 290);
  assert.equal(matrix.buildReceiptSpikeSchedule(manifest, { includeR2: true }).filter((step) => step.provider === "google-document-ai").length, 20);
  const oldApproval = { schemaVersion: "receipt-spike-approval-v2", approved: true, approvalId, series: "test", planSha256: "69fd24b98f5b301252912d43ea99e432f2fc92337af01113255da53905f90c46", maximumAuthorizedSpendMicrousd: 12_000_000, expiresAt: "2099-01-01T00:00:00.000Z" };
  assert.throws(() => budget.validateReceiptSpikeApproval(oldApproval, { planSha256: initial.planSha256, series: "test" }), (error) => error.code === "approval_missing");
});

test("oracle-only stage has its own plan and performs no reader or PDF work", async () => {
  const plan = approvalPlan.buildApprovedReceiptSpikePlan({ oracleOnly: true });
  assert.equal(plan.totals.openAiCalls, 60);
  assert.equal(plan.totals.googleDocumentAiCalls, 0);
  assert.equal(plan.totals.localPdfExtractions, 0);
  assert.equal(plan.matrix.length, 2);
  assert.notEqual(plan.planSha256, approvalPlan.buildApprovedReceiptSpikePlan().planSha256);
  assert.equal(matrix.buildReceiptSpikeSchedule(manifest, { oracleOnly: true }).length, 60);
  assert.throws(() => approvalPlan.buildApprovedReceiptSpikePlan({ oracleOnly: true, includeR2: true }), /incompatible_spike_stage_options/);
  assert.throws(() => approvalPlan.buildApprovedReceiptSpikePlan({ oracleOnly: true, canaryOnly: true }), /incompatible_spike_stage_options/);
  const dry = JSON.parse(execFileSync(process.execPath, ["scripts/receipt-spike/run-matrix.mjs", "--oracle-only"], { encoding: "utf8" }));
  assert.equal(dry.providerClientsConstructed, false);
  assert.equal(dry.providerCallsPlanned, 60);

  const root = temporary("oracle-stage");
  const results = new Map(manifest.files.map((file) => [file.fileId, JSON.parse(fs.readFileSync(path.join(fixtureRoot, file.evaluator.semantic.path), "utf8")).roleClassification]));
  let calls = 0;
  const summary = await matrix.runReceiptSpikeMatrix({
    fixtureRoot, manifest, series: "oracle-stage", planSha256: plan.planSha256, includeR2: false, oracleOnly: true,
    integrity: plan.integrity, outputRoot: root,
    readerPrompt: fs.readFileSync("prompts/receipt-spike/reader-v1.md", "utf8"),
    classifierPrompt: fs.readFileSync("prompts/receipt-spike/classifier-v1.md", "utf8"),
    approval: { approved: true, planSha256: plan.planSha256, maximumAuthorizedSpendMicrousd: 12_000_000, approvalId, series: "oracle-stage", carryover: [] },
    openai: {
      maximumClassifierCost: () => ({ maximumCostMicrousd: 1000, inputTokenUpperBound: 10000, outputTokenUpperBound: 16000 }),
      classifyRaw: async ({ model, classifierInputJson }) => {
        calls += 1;
        const fileId = JSON.parse(classifierInputJson).fileId;
        return { ...completed(100, 125), parsed: { text: JSON.stringify(results.get(fileId)), issue: null }, requestedModelId: model, returnedModelId: model };
      },
    },
  });
  assert.equal(calls, 60);
  assert.equal(summary.stage, "oracle_only");
  assert.equal(summary.providerCalls, 60);
  assert.deepEqual(summary.cells.map((item) => item.cell), ["oracle-literal-c1", "oracle-literal-c2"]);
  assert.equal(summary.budget.budgetChargedMicrousd, 7500);
  assert.equal(fs.existsSync(path.join(root, "oracle-stage", "r1-c1-clean-photo")), false);
});

test("planner source is independently bound and any planner change requires new approval", () => {
  const unsignedPlan = buildReceiptSpikePlan();
  const approvedPlan = approvalPlan.bindReceiptSpikePlanner(unsignedPlan);
  const plannerPath = "scripts/receipt-spike/plan-lib.mjs";
  const changedPlanner = Buffer.concat([fs.readFileSync(plannerPath), Buffer.from("\n// safety change\n")]);
  assert.throws(() => approvalPlan.bindReceiptSpikePlanner(unsignedPlan, { plannerBytes: changedPlanner }), /receipt_spike_planner_hash_mismatch/);

  const rebuiltPlan = structuredClone(unsignedPlan);
  rebuiltPlan.integrity.sourceSha256[plannerPath] = createHash("sha256").update(changedPlanner).digest("hex");
  const rebuiltApproval = approvalPlan.bindReceiptSpikePlanner(rebuiltPlan, { plannerBytes: changedPlanner });
  assert.notEqual(rebuiltApproval.planSha256, approvedPlan.planSha256);
  const staleApproval = { schemaVersion: "receipt-spike-approval-v3", carryover: [], approved: true, approvalId, series: "test", planSha256: approvedPlan.planSha256, maximumAuthorizedSpendMicrousd: 12_000_000, expiresAt: "2099-01-01T00:00:00.000Z" };
  assert.throws(() => budget.validateReceiptSpikeApproval(staleApproval, { planSha256: rebuiltApproval.planSha256, series: "test" }), (error) => error.code === "approval_plan_mismatch");
});

test("manifest and prompt bytes must match the approved plan before execution", () => {
  const plan = approvalPlan.buildApprovedReceiptSpikePlan();
  const readerPrompt = fs.readFileSync("prompts/receipt-spike/reader-v1.md", "utf8");
  const classifierPrompt = fs.readFileSync("prompts/receipt-spike/classifier-v1.md", "utf8");
  assert.equal(matrix.verifyReceiptSpikeManifest(fixtureRoot, manifest, { ...plan.integrity, readerPrompt, classifierPrompt }), 10);
  assert.throws(() => matrix.verifyReceiptSpikeManifest(fixtureRoot, manifest, { ...plan.integrity, readerPrompt: `${readerPrompt} `, classifierPrompt }), /reader_prompt_plan_hash_mismatch/);
});

test("runner defaults to a no-call dry plan", () => {
  const output = JSON.parse(execFileSync(process.execPath, ["scripts/receipt-spike/run-matrix.mjs"], { encoding: "utf8" }));
  assert.equal(output.providerClientsConstructed, false);
  assert.equal(output.providerCallsExecuted, 0);
  assert.equal(output.providerCallsPlanned, 250);
  assert.equal(output.includeR2, false);
  assert.equal(output.maximumAuthorizedSpendMicrousd, 12_000_000);
  const withR2 = JSON.parse(execFileSync(process.execPath, ["scripts/receipt-spike/run-matrix.mjs", "--include-r2"], { encoding: "utf8" }));
  assert.equal(withR2.providerCallsPlanned, 290);
  assert.notEqual(withR2.planSha256, output.planSha256);
});

test("paid mode refuses before credentials or provider construction when approval is absent", () => {
  const result = spawnSync(process.execPath, ["scripts/receipt-spike/run-matrix.mjs", "--execute", "--series", "test"], { encoding: "utf8", env: {} });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--approval-file/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY/);
});

test("approved execution loader and full preflight finish offline without creating a series", () => {
  const root = temporary("loader-preflight");
  const file = path.join(root, "approval.json");
  const plan = approvalPlan.buildApprovedReceiptSpikePlan();
  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: "receipt-spike-approval-v3",
    carryover: [],
    approved: true,
    approvalId,
    series: "loader-check",
    planSha256: plan.planSha256,
    maximumAuthorizedSpendMicrousd: 12_000_000,
    expiresAt: "2099-01-01T00:00:00.000Z",
  }), { mode: 0o600 });
  const args = ["scripts/receipt-spike/run-matrix.mjs", "--execute", "--series", "loader-check", "--approval-file", file];
  const options = { encoding: "utf8", env: {}, timeout: 10_000 };
  const missingKey = spawnSync(process.execPath, args, options);
  assert.equal(missingKey.error, undefined, "approved loader must not hang before credential validation");
  assert.notEqual(missingKey.status, 0);
  assert.match(missingKey.stderr, /missing_required_environment:OPENAI_API_KEY/);

  const preflight = spawnSync(process.execPath, [...args, "--preflight-only"], options);
  assert.equal(preflight.error, undefined, "full module and manifest preflight must not hang");
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.deepEqual(JSON.parse(preflight.stdout), {
    schemaVersion: "receipt-spike-preflight-v1",
    planSha256: plan.planSha256,
    series: "loader-check",
    includeR2: false,
    canaryOnly: false,
    oracleOnly: false,
    providerClientsConstructed: false,
    providerCallsExecuted: 0,
    seriesCreated: false,
  });
  assert.equal(fs.existsSync(".receipt-spike/runs/loader-check"), false);
});

test("approval requires exact plan, cap, expiry, and private permissions", () => {
  const dir = temporary("approval");
  const file = path.join(dir, "approval.json");
  const plan = approvalPlan.buildApprovedReceiptSpikePlan();
  const value = { schemaVersion: "receipt-spike-approval-v3", carryover: [], approved: true, approvalId, series: "series-a", planSha256: plan.planSha256, maximumAuthorizedSpendMicrousd: 12_000_000, expiresAt: "2099-01-01T00:00:00.000Z" };
  fs.writeFileSync(file, JSON.stringify(value), { mode: 0o644 });
  assert.throws(() => budget.readReceiptSpikeApproval(file, { planSha256: plan.planSha256, series: "series-a" }), (error) => error.code === "unsafe_approval_permissions");
  fs.chmodSync(file, 0o600);
  assert.equal(budget.readReceiptSpikeApproval(file, { planSha256: plan.planSha256, series: "series-a" }).approved, true);
  assert.throws(() => budget.readReceiptSpikeApproval(file, { planSha256: "0".repeat(64), series: "series-a" }), (error) => error.code === "approval_plan_mismatch");
  assert.throws(() => budget.validateReceiptSpikeApproval({ ...value, expiresAt: "2020-01-01T00:00:00.000Z" }, { planSha256: plan.planSha256, series: "series-a" }), (error) => error.code === "approval_expired");
  assert.throws(() => budget.validateReceiptSpikeApproval({ ...value, approvalId: "predictable" }, { planSha256: plan.planSha256, series: "series-a" }), (error) => error.code === "invalid_approval_id");
});

test("one approval cannot fund two --series or reset the ledger on resume", () => {
  const root = temporary("approval-series");
  const file = path.join(root, "approval.json");
  const plan = approvalPlan.buildApprovedReceiptSpikePlan();
  const value = { schemaVersion: "receipt-spike-approval-v3", carryover: [], approved: true, approvalId, series: "series-a", planSha256: plan.planSha256, maximumAuthorizedSpendMicrousd: 12_000_000, expiresAt: "2099-01-01T00:00:00.000Z" };
  fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  const a = budget.readReceiptSpikeApproval(file, { planSha256: plan.planSha256, series: "series-a" });
  const metadata = { approvalId: a.approvalId, series: a.series, planSha256: plan.planSha256, baselineCommit: "test", integrity: {} };
  const runRoot = path.join(root, "series-a");
  runner.bindSeriesToLedger(runRoot, metadata);
  const ledgerFile = path.join(runRoot, "spend-ledger.jsonl");
  const ledger = new budget.ReceiptSpikeBudgetLedger(ledgerFile, 100);
  ledger.begin({ callId: "one", provider: "fake", reservedMaxMicrousd: 80 });
  ledger.complete({ callId: "one", actualCostMicrousd: 80, budgetChargeMicrousd: 80, requestedModelId: "a", returnedModelId: "a" });
  assert.throws(() => budget.readReceiptSpikeApproval(file, { planSha256: plan.planSha256, series: "series-b" }), (error) => error.code === "approval_series_mismatch");
  const denied = spawnSync(process.execPath, ["scripts/receipt-spike/run-matrix.mjs", "--execute", "--series", "series-b", "--approval-file", file], { encoding: "utf8", env: {} });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /approval_series_mismatch|approval is restricted to one series/);
  assert.doesNotMatch(denied.stderr, /OPENAI_API_KEY/);
  assert.deepEqual(runner.bindSeriesToLedger(runRoot, metadata).series, "series-a");
  assert.throws(() => ledger.begin({ callId: "two", provider: "fake", reservedMaxMicrousd: 80 }), (error) => error.code === "budget_would_be_exceeded");
  assert.throws(() => runner.bindSeriesToLedger(runRoot, { ...metadata, approvalId: "c3cdfb30-ab81-4355-b31d-e8b8b2af0491" }), /series_plan_mismatch/);
  const replacedLedger = path.join(root, "replacement.jsonl");
  fs.writeFileSync(replacedLedger, "", { mode: 0o600 });
  fs.rmSync(ledgerFile);
  assert.throws(() => runner.bindSeriesToLedger(runRoot, metadata), /series_ledger_missing/);
  fs.renameSync(replacedLedger, ledgerFile);
  assert.throws(() => runner.bindSeriesToLedger(runRoot, metadata), /series_plan_mismatch/);
});

test("ledger stops before a call whose reservation could exceed the cap", () => {
  const dir = temporary("cap");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"), 100);
  ledger.begin({ callId: "one", provider: "fake", reservedMaxMicrousd: 90 });
  ledger.complete({ callId: "one", actualCostMicrousd: 70, budgetChargeMicrousd: 80, requestedModelId: "a", returnedModelId: "a" });
  assert.throws(() => ledger.begin({ callId: "two", provider: "fake", reservedMaxMicrousd: 21 }), (error) => error.code === "budget_would_be_exceeded");
  assert.equal(ledger.snapshot().spentMicrousd, 80);
  assert.equal(ledger.snapshot().actualCostMicrousd, 70);
  assert.equal(ledger.snapshot().budgetChargedMicrousd, 80);
});

test("two ledger instances cannot reserve against stale state", () => {
  const dir = temporary("shared-ledger");
  const file = path.join(dir, "ledger.jsonl");
  const first = new budget.ReceiptSpikeBudgetLedger(file, 100);
  const second = new budget.ReceiptSpikeBudgetLedger(file, 100);
  first.begin({ callId: "first", provider: "fake", reservedMaxMicrousd: 80 });
  assert.throws(() => second.begin({ callId: "second", provider: "fake", reservedMaxMicrousd: 80 }), (error) => error.code === "unresolved_provider_call");
  assert.equal(second.snapshot().committedMicrousd, 80);
});

test("a series lock excludes a second runner for the full execution window", () => {
  const root = temporary("series-lock");
  const release = budget.acquireReceiptSpikeSeriesLock(root);
  try {
    assert.throws(() => budget.acquireReceiptSpikeSeriesLock(root), (error) => error.code === "series_locked");
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import { acquireReceiptSpikeSeriesLock } from ${JSON.stringify(new URL("../lib/server/receipt-spike/budget.ts", import.meta.url).href)};
      try {
        acquireReceiptSpikeSeriesLock(${JSON.stringify(root)});
        process.exit(0);
      } catch (error) {
        process.exit(error?.code === "series_locked" ? 23 : 24);
      }
    `], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(child.status, 23, child.stderr);
  } finally {
    release();
  }
  const releaseAgain = budget.acquireReceiptSpikeSeriesLock(root);
  releaseAgain();
});

test("completed calls resume from private artifacts without a second dispatch", async () => {
  const dir = temporary("resume");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"));
  let calls = 0;
  const options = { ledger, callId: "same", provider: "fake", reservedMaxMicrousd: 1_000, artifactDirectory: path.join(dir, "artifact"), requestMetadata: { inputSha256: "abc" }, dispatch: async () => { calls += 1; return completed(); } };
  assert.equal((await runner.executeBudgetedProviderCall(options)).status, "completed");
  assert.equal((await runner.executeBudgetedProviderCall(options)).status, "reused");
  assert.equal(calls, 1);
  assert.equal(fs.statSync(path.join(dir, "artifact", "provider-result.json")).mode & 0o777, 0o600);
});

test("uncertain provider outcome freezes the series and preserves reservation", async () => {
  const dir = temporary("uncertain");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"));
  await assert.rejects(() => runner.executeBudgetedProviderCall({ ledger, callId: "failed", provider: "fake", reservedMaxMicrousd: 1_000, artifactDirectory: path.join(dir, "failed"), requestMetadata: {}, dispatch: async () => { throw new Error("timeout"); } }), /timeout/);
  const state = ledger.snapshot();
  assert.deepEqual(state.uncertainCallIds, ["failed"]);
  assert.equal(state.heldMicrousd, 1_000);
  assert.throws(() => ledger.begin({ callId: "next", provider: "fake", reservedMaxMicrousd: 1 }), (error) => error.code === "unresolved_provider_call");
});

test("cost above a reservation blocks the series for manual audit", async () => {
  const dir = temporary("over-reservation");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"));
  await assert.rejects(() => runner.executeBudgetedProviderCall({ ledger, callId: "large", provider: "fake", reservedMaxMicrousd: 100, artifactDirectory: path.join(dir, "large"), requestMetadata: {}, dispatch: async () => completed(101) }), (error) => error.code === "reservation_exceeded");
  assert.deepEqual(ledger.snapshot().uncertainCallIds, ["large"]);
});

test("ledger rejects a budget charge below the usage-derived cost", () => {
  const dir = temporary("invalid-budget-charge");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"));
  ledger.begin({ callId: "understated", provider: "fake", reservedMaxMicrousd: 100 });
  assert.throws(() => ledger.complete({
    callId: "understated",
    actualCostMicrousd: 80,
    budgetChargeMicrousd: 79,
    requestedModelId: "a",
    returnedModelId: "a",
  }), (error) => error.code === "invalid_budget_charge");
  assert.equal(ledger.snapshot().heldMicrousd, 100);
});

test("a returned model change cannot be mixed into the same result series", () => {
  const file = path.join(temporary("model-series"), "models.json");
  assert.equal(runner.enforceReturnedModelSeries(file, { provider: "openai", requestedModelId: "alias", returnedModelId: "snapshot-a" }), "snapshot-a");
  assert.equal(runner.enforceReturnedModelSeries(file, { provider: "openai", requestedModelId: "alias", returnedModelId: "snapshot-a" }), "snapshot-a");
  assert.throws(() => runner.enforceReturnedModelSeries(file, { provider: "openai", requestedModelId: "alias", returnedModelId: "snapshot-b" }), /returned_model_changed/);
});

test("an existing series cannot resume under a different plan", () => {
  const file = path.join(temporary("series-plan"), "run.meta.json");
  const metadata = { planSha256: "a".repeat(64), baselineCommit: "base", integrity: { manifestSha256: "b".repeat(64) } };
  runner.bindSeriesToPlan(file, metadata);
  assert.deepEqual(runner.bindSeriesToPlan(file, metadata), metadata);
  assert.throws(() => runner.bindSeriesToPlan(file, { ...metadata, planSha256: "c".repeat(64) }), /series_plan_mismatch/);
});

test("OpenAI adapter records returned model, usage, and list-price cost without exposing its key", async () => {
  let request;
  const semantic = JSON.parse(fs.readFileSync(path.join(fixtureRoot, manifest.files[0].evaluator.semantic.path), "utf8"));
  const fakeFetch = async (_url, options) => {
    request = options;
    return new Response(JSON.stringify({ status: "completed", model: "gpt-6-sol-2026-09-01", output_text: JSON.stringify(semantic.roleClassification), usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new providers.OpenAiReceiptSpikeClient("test-api-key", fakeFetch);
  const upperBound = client.maximumClassifierCost({ model: "gpt-6-sol", instructions: "synthetic", classifierInputJson: "{}", reasoningEffort: "low" });
  const result = await client.classify({ model: "gpt-6-sol", instructions: "synthetic", classifierInputJson: "{}", reasoningEffort: "low" });
  assert.equal(result.returnedModelId, "gpt-6-sol-2026-09-01");
  assert.equal(result.actualCostMicrousd, 400);
  assert.equal(result.budgetChargeMicrousd, 450);
  assert.ok(upperBound.maximumCostMicrousd >= result.budgetChargeMicrousd);
  assert.match(request.headers.authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(result), /test-api-key/);
  const body = JSON.parse(request.body);
  assert.match(body.input[0].content[0].text, /RoleClassification JSON object/);
  assert.match(body.input[0].content[0].text, /billing_period/);
  assert.equal(body.input[0].content[1].text, "{}", "the indexed literal remains a separate unchanged input part");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.deepEqual(body.text.format.schema.properties.tableSchemas.items.required, ["blockId", "columns"]);
  assert.equal(body.text.format.schema.properties.tableSchemas.items.properties.tableBlockId, undefined);
});

test("strict classifier wire uses generated enums and preserves the core's sparse slots", () => {
  const checkStrict = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "object") {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(node.required, Object.keys(node.properties));
    }
    for (const child of Object.values(node)) checkStrict(child);
  };
  checkStrict(classifierSchema.classifierResponseSchema);
  const semantic = JSON.parse(fs.readFileSync(path.join(fixtureRoot, manifest.files[0].evaluator.semantic.path), "utf8"));
  const source = semantic.roleClassification;
  const wire = { ...source, rows: source.rows.map((row) => ({ ...row, items: row.items.map((item) => ({
    ...item,
    dueScope: item.dueScope ?? null,
    optionalScope: item.optionalScope ?? null,
    declaredState: item.declaredState ?? null,
    affectsDue: item.affectsDue ?? null,
    slots: Object.entries(item.slots).map(([slot, binding]) => item.mode === "label_value"
      ? { slot, cellIds: binding.cellIds, tokenIds: binding.tokenIds ?? [], textRange: binding.textRange ?? null }
      : { slot, columnKey: binding.columnKey, tokenIds: binding.tokenIds ?? [] }),
  })) })) };
  const converted = classifierSchema.classifierWireToCore(wire);
  assert.deepEqual(converted.documents, source.documents);
  assert.deepEqual(converted.tableSchemas, source.tableSchemas);
  assert.deepEqual(converted.rows.map((row) => row.items.map((item) => item.role)), source.rows.map((row) => row.items.map((item) => item.role)));
  assert.deepEqual(converted.rows[2].items[0].slots.billing_period.cellIds, source.rows[2].items[0].slots.billing_period.cellIds);
  assert.ok(classifierSchema.classifierResponseSchema.properties.rows.items.properties.items.items.anyOf[0].properties.role.enum.includes("billing_period"));
  assert.ok(classifierSchema.classifierResponseSchema.properties.rows.items.properties.items.items.anyOf[0].properties.slots.items.properties.slot.enum.includes("billing_period"));
  assert.throws(() => classifierSchema.classifierWireToCore({ ...wire, rows: [{ rowId: "r", items: [{ ...wire.rows[0].items[0], slots: [wire.rows[0].items[0].slots[0], wire.rows[0].items[0].slots[0]] }] }] }), /classifier_slot_wire_invalid/);
});

test("completed malformed classifier output records usage and cost before contract validation", async () => {
  const dir = temporary("completed-malformed");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"));
  const output = { documents: [], sharedRowIds: [], tableSchemas: [{ blockId: "b", tableBlockId: "bad", columns: [] }], rows: [] };
  const client = new providers.OpenAiReceiptSpikeClient("test-api-key", async () => new Response(JSON.stringify({
    status: "completed", model: "gpt-6-sol-snapshot", output_text: JSON.stringify(output), usage: { input_tokens: 100, output_tokens: 20 },
  }), { status: 200, headers: { "x-request-id": "req-malformed" } }));
  const directory = path.join(dir, "call");
  await assert.rejects(() => runner.executeBudgetedProviderCall({
    ledger, callId: "malformed", provider: "openai", reservedMaxMicrousd: 1000,
    artifactDirectory: directory, requestMetadata: {},
    dispatch: () => client.classifyRaw({ model: "gpt-6-sol", instructions: "synthetic", classifierInputJson: "{}", reasoningEffort: "low" }),
    parseCompleted: (payload) => {
      assert.deepEqual(ledger.snapshot().completedCallIds, ["malformed"], "accounting precedes JSON and semantic parsing");
      assert.equal(payload.issue, null);
      return adapters.parseClassifierOutput(classifierSchema.classifierWireToCore(JSON.parse(payload.text)));
    },
  }), /provider_completed_output_invalid/);
  const state = ledger.snapshot();
  assert.deepEqual(state.completedCallIds, ["malformed"]);
  assert.deepEqual(state.uncertainCallIds, []);
  assert.equal(state.actualCostMicrousd, 400);
  assert.equal(state.budgetChargedMicrousd, 450);
  assert.equal(runner.readPrivateJson(path.join(directory, "response.usage.json")).requestId, "req-malformed");
  assert.match(runner.readPrivateJson(path.join(directory, "error.json")).message, /tableBlockId/);
  assert.equal(fs.statSync(path.join(directory, "error.json")).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(directory, "provider-result.json")), false);
});

test("completed OpenAI refusal and incomplete output with valid usage are charged before validation stops the series", async () => {
  for (const responseStatus of ["completed", "incomplete"]) {
    const dir = temporary(`structured-${responseStatus}`);
    const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"));
    const directory = path.join(dir, "call");
    const client = new providers.OpenAiReceiptSpikeClient("test-api-key", async () => new Response(JSON.stringify({
      status: responseStatus, model: "gpt-6-sol-snapshot", usage: { input_tokens: 100, output_tokens: 20 },
      output: [{ type: "message", content: [{ type: "refusal", refusal: "private refusal text" }] }],
    }), { status: 200, headers: { "x-request-id": "req-structured" } }));
    await assert.rejects(() => runner.executeBudgetedProviderCall({
      ledger, callId: "structured", provider: "openai", reservedMaxMicrousd: 1000,
      artifactDirectory: directory, requestMetadata: {},
      dispatch: () => client.classifyRaw({ model: "gpt-6-sol", instructions: "synthetic", classifierInputJson: "{}", reasoningEffort: "low" }),
      parseCompleted: (payload) => {
        assert.deepEqual(ledger.snapshot().completedCallIds, ["structured"]);
        if (payload.issue) throw new providers.OpenAiOutputIssue(payload.issue);
        return adapters.parseClassifierOutput(classifierSchema.classifierWireToCore(JSON.parse(payload.text)));
      },
    }), /provider_completed_output_invalid/);
    const state = ledger.snapshot();
    assert.equal(state.actualCostMicrousd, 400);
    assert.equal(state.budgetChargedMicrousd, 450);
    assert.deepEqual(state.uncertainCallIds, []);
    assert.equal(runner.readPrivateJson(path.join(directory, "error.json")).code,
      responseStatus === "completed" ? "openai_refusal" : "openai_response_incomplete");
    assert.equal(runner.readPrivateJson(path.join(directory, "response.usage.json")).requestId, "req-structured");
    assert.doesNotMatch(fs.readFileSync(path.join(directory, "error.json"), "utf8"), /private refusal text/);
    assert.equal(fs.statSync(path.join(directory, "error.json")).mode & 0o777, 0o600);
    assert.equal(fs.existsSync(path.join(directory, "provider-result.json")), false);
  }
});

test("HTTP validation errors retain private diagnostics and freeze the budget without exposing the message", async () => {
  const dir = temporary("http-diagnostic");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"));
  const fakeFetch = async () => new Response(JSON.stringify({ error: { type: "invalid_request_error", code: "invalid_json_input", param: "text.format", message: "private document content" } }), {
    status: 400, headers: { "x-request-id": "req-test", "openai-processing-ms": "3" },
  });
  const client = new providers.OpenAiReceiptSpikeClient("test-api-key", fakeFetch);
  const directory = path.join(dir, "call");
  await assert.rejects(() => runner.executeBudgetedProviderCall({ ledger, callId: "bad", provider: "openai", reservedMaxMicrousd: 1000,
    artifactDirectory: directory, requestMetadata: {}, dispatch: () => client.classify({ model: "gpt-6-sol", instructions: "JSON", classifierInputJson: "{}", reasoningEffort: "low" }),
  }), (error) => error.message === "openai_http_400");
  const diagnostic = runner.readPrivateJson(path.join(directory, "error.json"));
  assert.equal(diagnostic.message, "private document content");
  assert.equal(diagnostic.requestId, "req-test");
  assert.equal(diagnostic.outcome, "provider_rejected_definitive");
  assert.equal(fs.statSync(path.join(directory, "error.json")).mode & 0o777, 0o600);
  assert.deepEqual(ledger.snapshot().uncertainCallIds, ["bad"]);
  assert.equal(ledger.snapshot().heldMicrousd, 1000);
  const nonJson = new providers.OpenAiReceiptSpikeClient("test-api-key", async () => new Response("gateway error", { status: 502 }));
  await assert.rejects(() => runner.executeBudgetedProviderCall({ ledger: new budget.ReceiptSpikeBudgetLedger(path.join(dir, "proxy-ledger.jsonl")), callId: "proxy", provider: "openai", reservedMaxMicrousd: 1000,
    artifactDirectory: path.join(dir, "proxy"), requestMetadata: {}, dispatch: () => nonJson.classify({ model: "gpt-6-sol", instructions: "JSON", classifierInputJson: "{}", reasoningEffort: "low" }),
  }), /openai_http_502/);
  assert.equal(runner.readPrivateJson(path.join(dir, "proxy", "error.json")).outcome, "provider_outcome_unknown");
});

test("carryover binds prior ledgers into the plan and reserves their full uncertain amount", async () => {
  const root = temporary("carryover");
  const oldRoot = path.join(root, "previous");
  runner.bindSeriesToLedger(oldRoot, { approvalId, series: "previous", planSha256: "a".repeat(64), baselineCommit: "main", integrity: {} });
  const oldLedger = new budget.ReceiptSpikeBudgetLedger(path.join(oldRoot, "spend-ledger.jsonl"));
  oldLedger.begin({ callId: "s01", provider: "openai", reservedMaxMicrousd: 289_683 });
  oldLedger.markUncertain("s01", "provider_call_outcome_unknown");
  const carryover = buildReceiptSpikePlan();
  assert.equal(carryover.canaryOnly, false);
  const previous = (await import("../scripts/receipt-spike/plan-lib.mjs")).loadReceiptSpikeCarryover(["previous"], root);
  assert.equal(previous[0].committedMicrousd, 289_683);
  assert.notEqual(approvalPlan.buildApprovedReceiptSpikePlan({ canaryOnly: true, carryover: previous }).planSha256,
    approvalPlan.buildApprovedReceiptSpikePlan({ canaryOnly: true }).planSha256);
  assert.equal(matrix.verifyReceiptSpikeCarryover(root, "canary", previous), 289_683);
  const approval = { schemaVersion: "receipt-spike-approval-v3", approved: true, approvalId, series: "canary", carryover: previous,
    planSha256: approvalPlan.buildApprovedReceiptSpikePlan({ canaryOnly: true, carryover: previous }).planSha256,
    maximumAuthorizedSpendMicrousd: 12_000_000, expiresAt: "2099-01-01T00:00:00.000Z" };
  assert.equal(budget.validateReceiptSpikeApproval(approval, { planSha256: approval.planSha256, series: "canary", carryover: previous }).carryover.length, 1);
  assert.throws(() => budget.validateReceiptSpikeApproval(approval, { planSha256: approval.planSha256, series: "canary", carryover: [] }), (error) => error.code === "approval_carryover_mismatch");
  const canaryRoot = path.join(root, "canary");
  runner.bindSeriesToLedger(canaryRoot, { approvalId, series: "canary", planSha256: approval.planSha256, baselineCommit: "main", integrity: {}, carryover: previous });
  const canaryLedger = new budget.ReceiptSpikeBudgetLedger(path.join(canaryRoot, "spend-ledger.jsonl"), 12_000_000 - 289_683);
  assert.throws(() => canaryLedger.begin({ callId: "overspend", provider: "openai", reservedMaxMicrousd: 11_710_318 }), (error) => error.code === "budget_would_be_exceeded");
  canaryLedger.begin({ callId: "canary", provider: "openai", reservedMaxMicrousd: 1_000 });
  canaryLedger.complete({ callId: "canary", actualCostMicrousd: 200, budgetChargeMicrousd: 300, requestedModelId: "a", returnedModelId: "a" });
  const both = (await import("../scripts/receipt-spike/plan-lib.mjs")).loadReceiptSpikeCarryover(["previous", "canary"], root);
  assert.equal(matrix.verifyReceiptSpikeCarryover(root, "matrix", both), 289_983);
  assert.throws(() => matrix.verifyReceiptSpikeCarryover(root, "matrix", previous), /prior_series_carryover_incomplete/);
  fs.appendFileSync(path.join(oldRoot, "spend-ledger.jsonl"), "\n");
  assert.throws(() => matrix.verifyReceiptSpikeCarryover(root, "matrix", both), /prior_series_ledger_changed/);
});

test("S10 canary checks the real oracle input once without adding a matrix evaluation", async () => {
  const root = temporary("s10-canary");
  const plan = approvalPlan.buildApprovedReceiptSpikePlan({ canaryOnly: true });
  assert.equal(plan.totals.openAiCalls, 1);
  assert.equal(plan.totals.localPdfExtractions, 0);
  const file = manifest.files.find((entry) => entry.fileId === "S10");
  const semantic = JSON.parse(fs.readFileSync(path.join(fixtureRoot, file.evaluator.semantic.path), "utf8"));
  let calls = 0;
  const summary = await matrix.runReceiptSpikeMatrix({
    fixtureRoot, manifest, series: "canary", planSha256: plan.planSha256, includeR2: false, canaryOnly: true,
    integrity: plan.integrity, outputRoot: root, readerPrompt: fs.readFileSync("prompts/receipt-spike/reader-v1.md", "utf8"),
    classifierPrompt: fs.readFileSync("prompts/receipt-spike/classifier-v1.md", "utf8"),
    approval: { approved: true, planSha256: plan.planSha256, maximumAuthorizedSpendMicrousd: 12_000_000, approvalId, series: "canary", carryover: [] },
    openai: {
      maximumClassifierCost: () => ({ maximumCostMicrousd: 10_000, inputTokenUpperBound: 20_000, outputTokenUpperBound: 16_000 }),
      classifyRaw: async () => { calls += 1; return { ...completed(200, 300), parsed: { text: JSON.stringify(semantic.roleClassification), issue: null }, requestedModelId: "gpt-6-sol", returnedModelId: "gpt-6-sol-snapshot" }; },
    },
  });
  assert.equal(calls, 1);
  assert.equal(summary.canary, "passed");
  assert.equal(summary.budget.budgetChargedMicrousd, 300);
  assert.equal(fs.existsSync(path.join(root, "canary", "canary-oracle-s10-c1", "S10", "oracle_literal", "run-1", "classifier", "canary-validation.json")), true);
});

test("missing OpenAI usage leaves the paid call uncertain instead of recording zero cost", async () => {
  const semantic = JSON.parse(fs.readFileSync(path.join(fixtureRoot, manifest.files[0].evaluator.semantic.path), "utf8"));
  const fakeFetch = async () => new Response(JSON.stringify({ status: "completed", model: "gpt-6-sol", output_text: JSON.stringify(semantic.roleClassification) }), { status: 200, headers: { "content-type": "application/json" } });
  const client = new providers.OpenAiReceiptSpikeClient("test-api-key", fakeFetch);
  const bound = client.maximumClassifierCost({ model: "gpt-6-sol", instructions: "synthetic", classifierInputJson: "{}", reasoningEffort: "low" });
  const dir = temporary("missing-usage");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"));
  await assert.rejects(() => runner.executeBudgetedProviderCall({
    ledger,
    callId: "missing-usage",
    provider: "openai",
    reservedMaxMicrousd: bound.maximumCostMicrousd,
    artifactDirectory: path.join(dir, "artifact"),
    requestMetadata: {},
    dispatch: () => client.classify({ model: "gpt-6-sol", instructions: "synthetic", classifierInputJson: "{}", reasoningEffort: "low" }),
  }), /openai_usage_missing/);
  assert.deepEqual(ledger.snapshot().uncertainCallIds, ["missing-usage"]);
  assert.equal(ledger.snapshot().spentMicrousd, 0);
  assert.equal(ledger.snapshot().heldMicrousd, bound.maximumCostMicrousd);
});

test("request-specific reservation is an upper bound at the maximum admitted usage", async () => {
  const file = manifest.files.find((entry) => entry.fileId === "S01");
  const descriptor = file.inputs.png_clean;
  const bytes = fs.readFileSync(path.join(fixtureRoot, descriptor.path));
  const literal = JSON.parse(fs.readFileSync(path.join(fixtureRoot, file.evaluator.literal_source.path), "utf8"));
  const instructions = fs.readFileSync("prompts/receipt-spike/reader-v1.md", "utf8");
  let usage;
  const fakeFetch = async () => new Response(JSON.stringify({ status: "completed", model: "gpt-6-sol", output_text: JSON.stringify(literal), usage }), { status: 200, headers: { "content-type": "application/json" } });
  const client = new providers.OpenAiReceiptSpikeClient("test-api-key", fakeFetch);
  const bound = client.maximumImageCost({ model: "gpt-6-sol", instructions, bytes, mimeType: "image/png", width: descriptor.width, height: descriptor.height });
  usage = { input_tokens: bound.inputTokenUpperBound, output_tokens: bound.outputTokenUpperBound };
  const result = await client.readImage({ model: "gpt-6-sol", instructions, bytes, mimeType: "image/png" });
  assert.ok(bound.inputTokenUpperBound > 272_000, "the test must exercise long-context pricing");
  assert.ok(bound.maximumCostMicrousd >= result.budgetChargeMicrousd);
  assert.ok(bound.maximumCostMicrousd < budget.RECEIPT_SPIKE_HARD_CAP_MICROUSD);
});

test("Google OCR adapter records page cost and sends the documented OCR request", async () => {
  let requestedUrl = "";
  const fakeFetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ document: { text: "Период\n", pages: [{ dimension: { width: 100, height: 100 }, lines: [{ layout: { textAnchor: { textSegments: [{ endIndex: "6" }] }, boundingPoly: { normalizedVertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.1 }, { x: 0, y: 0.1 }] } } }] }] } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new providers.GoogleEnterpriseOcrClient({ accessToken: "test-access-value", projectId: "project", location: "eu", processorId: "processor", processorVersion: "version" }, fakeFetch);
  const result = await client.read({ bytes: new Uint8Array([1]), mimeType: "image/png" });
  assert.match(requestedUrl, /eu-documentai\.googleapis\.com/);
  assert.equal(result.usage.pages, 1);
  assert.equal(result.actualCostMicrousd, 1_500);
  assert.equal(result.budgetChargeMicrousd, 1_500);
  assert.doesNotMatch(JSON.stringify(result), /test-access-value/);
});
