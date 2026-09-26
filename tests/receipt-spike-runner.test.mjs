import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
const matrix = await import("../lib/server/receipt-spike/matrix-runner.ts");
const { buildReceiptSpikePlan, canonicalJson } = await import("../scripts/receipt-spike/plan-lib.mjs");

const fixtureRoot = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "spike-manifest.json"), "utf8"));
const temporary = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `homory-${name}-`));
const completed = (actualCostMicrousd = 100) => ({
  parsed: { ok: true },
  raw: { id: "synthetic-response" },
  requestedModelId: "requested",
  returnedModelId: "returned",
  latencyMs: 5,
  usage: { inputTokens: 10, outputTokens: 2 },
  actualCostMicrousd,
});

test("receipt spike plan fingerprint and matrix schedule are stable and complete", () => {
  const first = buildReceiptSpikePlan();
  const second = buildReceiptSpikePlan();
  assert.equal(first.planSha256, second.planSha256);
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  const schedule = matrix.buildReceiptSpikeSchedule(manifest);
  assert.equal(schedule.filter((step) => step.kind !== "local_reader").length, 290);
  assert.equal(schedule.filter((step) => step.kind === "local_reader").length, 10);
  assert.equal(schedule.filter((step) => step.cell === "r1-reuse-c2" && step.kind === "provider_reader").length, 0);
});

test("runner defaults to a no-call dry plan", () => {
  const output = JSON.parse(execFileSync(process.execPath, ["scripts/receipt-spike/run-matrix.mjs"], { encoding: "utf8" }));
  assert.equal(output.providerClientsConstructed, false);
  assert.equal(output.providerCallsExecuted, 0);
  assert.equal(output.providerCallsPlanned, 290);
  assert.equal(output.maximumAuthorizedSpendMicrousd, 12_000_000);
});

test("paid mode refuses before credentials or provider construction when approval is absent", () => {
  const result = spawnSync(process.execPath, ["scripts/receipt-spike/run-matrix.mjs", "--execute", "--series", "test"], { encoding: "utf8", env: {} });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--approval-file/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY/);
});

test("approval requires exact plan, cap, expiry, and private permissions", () => {
  const dir = temporary("approval");
  const file = path.join(dir, "approval.json");
  const plan = buildReceiptSpikePlan();
  const value = { schemaVersion: "receipt-spike-approval-v1", approved: true, planSha256: plan.planSha256, maximumAuthorizedSpendMicrousd: 12_000_000, expiresAt: "2099-01-01T00:00:00.000Z" };
  fs.writeFileSync(file, JSON.stringify(value), { mode: 0o644 });
  assert.throws(() => budget.readReceiptSpikeApproval(file, { planSha256: plan.planSha256 }), (error) => error.code === "unsafe_approval_permissions");
  fs.chmodSync(file, 0o600);
  assert.equal(budget.readReceiptSpikeApproval(file, { planSha256: plan.planSha256 }).approved, true);
  assert.throws(() => budget.readReceiptSpikeApproval(file, { planSha256: "0".repeat(64) }), (error) => error.code === "approval_plan_mismatch");
  assert.throws(() => budget.validateReceiptSpikeApproval({ ...value, expiresAt: "2020-01-01T00:00:00.000Z" }, { planSha256: plan.planSha256 }), (error) => error.code === "approval_expired");
});

test("ledger stops before a call whose reservation could exceed the cap", () => {
  const dir = temporary("cap");
  const ledger = new budget.ReceiptSpikeBudgetLedger(path.join(dir, "ledger.jsonl"), 100);
  ledger.begin({ callId: "one", provider: "fake", reservedMaxMicrousd: 90 });
  ledger.complete({ callId: "one", actualCostMicrousd: 80, requestedModelId: "a", returnedModelId: "a" });
  assert.throws(() => ledger.begin({ callId: "two", provider: "fake", reservedMaxMicrousd: 21 }), (error) => error.code === "budget_would_be_exceeded");
  assert.equal(ledger.snapshot().spentMicrousd, 80);
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

test("a returned model change cannot be mixed into the same result series", () => {
  const file = path.join(temporary("model-series"), "models.json");
  assert.equal(runner.enforceReturnedModelSeries(file, { provider: "openai", requestedModelId: "alias", returnedModelId: "snapshot-a" }), "snapshot-a");
  assert.equal(runner.enforceReturnedModelSeries(file, { provider: "openai", requestedModelId: "alias", returnedModelId: "snapshot-a" }), "snapshot-a");
  assert.throws(() => runner.enforceReturnedModelSeries(file, { provider: "openai", requestedModelId: "alias", returnedModelId: "snapshot-b" }), /returned_model_changed/);
});

test("OpenAI adapter records returned model, usage, and list-price cost without exposing its key", async () => {
  let request;
  const semantic = JSON.parse(fs.readFileSync(path.join(fixtureRoot, manifest.files[0].evaluator.semantic.path), "utf8"));
  const fakeFetch = async (_url, options) => {
    request = options;
    return new Response(JSON.stringify({ status: "completed", model: "gpt-6-sol-2026-09-01", output_text: JSON.stringify(semantic.roleClassification), usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new providers.OpenAiReceiptSpikeClient("test-api-key", fakeFetch);
  const result = await client.classify({ model: "gpt-6-sol", instructions: "synthetic", classifierInputJson: "{}", reasoningEffort: "low" });
  assert.equal(result.returnedModelId, "gpt-6-sol-2026-09-01");
  assert.equal(result.actualCostMicrousd, 400);
  assert.match(request.headers.authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(result), /test-api-key/);
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
  assert.doesNotMatch(JSON.stringify(result), /test-access-value/);
});
