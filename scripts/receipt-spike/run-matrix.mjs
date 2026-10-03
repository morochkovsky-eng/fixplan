import fs from "node:fs";
import path from "node:path";
import { require as tsRequire } from "tsx/cjs/api";
import { buildApprovedReceiptSpikePlan } from "./approval-plan.mjs";
import { loadReceiptSpikeCarryover } from "./plan-lib.mjs";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const preflightOnly = args.includes("--preflight-only");
const includeR2 = args.includes("--include-r2");
const canaryOnly = args.includes("--canary-only");
const oracleOnly = args.includes("--oracle-only");
const readerOnly = args.includes("--reader-only");
const readerCanaryOnly = args.includes("--reader-canary-only");
const outputRoot = path.resolve(".receipt-spike/runs");
const priorSeries = args.flatMap((arg, index) => arg === "--prior-series" ? [args[index + 1]] : []);
const argument = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const plan = buildApprovedReceiptSpikePlan({ includeR2, canaryOnly, oracleOnly, readerOnly, readerCanaryOnly, carryover: loadReceiptSpikeCarryover(priorSeries, outputRoot) });

if (!execute) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "receipt-spike-runner-dry-plan-v1",
    planSha256: plan.planSha256,
    includeR2,
    canaryOnly,
    oracleOnly,
    readerOnly,
    readerCanaryOnly,
    approvalBinding: plan.approvalBinding,
    providerCallsPlanned: plan.totals.providerCalls,
    localPdfExtractionsPlanned: plan.totals.localPdfExtractions,
    maximumAuthorizedSpendMicrousd: 12_000_000,
    approvalRecorded: false,
    providerClientsConstructed: false,
    providerCallsExecuted: 0,
    nextStep: "A separate owner approval file matching this exact plan SHA is required before --execute can run.",
  }, null, 2)}\n`);
  process.exit(0);
}

const series = argument("--series");
const approvalFile = argument("--approval-file");
if (!series || !approvalFile) throw new Error("--execute requires --series and --approval-file");

const budget = tsRequire("../../lib/server/receipt-spike/budget.ts", import.meta.url);
const approval = budget.readReceiptSpikeApproval(path.resolve(approvalFile), { planSha256: plan.planSha256, series, carryover: plan.carryover });

const requiredEnvironment = ["OPENAI_API_KEY"];
if (includeR2) requiredEnvironment.push(
  "GOOGLE_DOCUMENT_AI_ACCESS_TOKEN", "GOOGLE_CLOUD_PROJECT", "GOOGLE_DOCUMENT_AI_LOCATION", "GOOGLE_DOCUMENT_AI_PROCESSOR_ID",
);
if (!preflightOnly) for (const name of requiredEnvironment) if (!process.env[name]) throw new Error(`missing_required_environment:${name}`);

const providers = tsRequire("../../lib/server/receipt-spike/providers.ts", import.meta.url);
const matrix = tsRequire("../../lib/server/receipt-spike/matrix-runner.ts", import.meta.url);
const fixtureRoot = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "spike-manifest.json"), "utf8"));
const readerPrompt = fs.readFileSync("prompts/receipt-spike/reader-v1.md", "utf8");
const classifierPrompt = fs.readFileSync("prompts/receipt-spike/classifier-v1.md", "utf8");
if (preflightOnly) {
  matrix.verifyReceiptSpikeManifest(fixtureRoot, manifest, { ...plan.integrity, readerPrompt, classifierPrompt });
  matrix.verifyReceiptSpikeCarryover(outputRoot, series, approval.carryover);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "receipt-spike-preflight-v1",
    planSha256: plan.planSha256,
    series: approval.series,
    includeR2,
    canaryOnly,
    oracleOnly,
    readerOnly,
    readerCanaryOnly,
    providerClientsConstructed: false,
    providerCallsExecuted: 0,
    seriesCreated: false,
  }, null, 2)}\n`);
  process.exit(0);
}
const openai = new providers.OpenAiReceiptSpikeClient(process.env.OPENAI_API_KEY);
const google = includeR2 ? new providers.GoogleEnterpriseOcrClient({
  accessToken: process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN,
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_DOCUMENT_AI_LOCATION,
  processorId: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
  processorVersion: manifest.models.R2.requestedVersion,
}) : undefined;

const result = await matrix.runReceiptSpikeMatrix({
  fixtureRoot,
  manifest,
  series,
  planSha256: plan.planSha256,
  includeR2,
  canaryOnly,
  oracleOnly,
  readerOnly,
  readerCanaryOnly,
  integrity: plan.integrity,
  outputRoot,
  readerPrompt,
  classifierPrompt,
  approval,
  openai,
  google,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
