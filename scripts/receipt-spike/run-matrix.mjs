import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { buildApprovedReceiptSpikePlan } from "./approval-plan.mjs";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const argument = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const plan = buildApprovedReceiptSpikePlan();

if (!execute) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "receipt-spike-runner-dry-plan-v1",
    planSha256: plan.planSha256,
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

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return nextResolve(specifier, context);
} });
await import("tsx/esm");
const budget = await import("../../lib/server/receipt-spike/budget.ts");
const approval = budget.readReceiptSpikeApproval(path.resolve(approvalFile), { planSha256: plan.planSha256 });

const requiredEnvironment = [
  "OPENAI_API_KEY",
  "GOOGLE_DOCUMENT_AI_ACCESS_TOKEN",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_DOCUMENT_AI_LOCATION",
  "GOOGLE_DOCUMENT_AI_PROCESSOR_ID",
];
for (const name of requiredEnvironment) if (!process.env[name]) throw new Error(`missing_required_environment:${name}`);

const providers = await import("../../lib/server/receipt-spike/providers.ts");
const matrix = await import("../../lib/server/receipt-spike/matrix-runner.ts");
const fixtureRoot = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "spike-manifest.json"), "utf8"));
const openai = new providers.OpenAiReceiptSpikeClient(process.env.OPENAI_API_KEY);
const google = new providers.GoogleEnterpriseOcrClient({
  accessToken: process.env.GOOGLE_DOCUMENT_AI_ACCESS_TOKEN,
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_DOCUMENT_AI_LOCATION,
  processorId: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
  processorVersion: manifest.models.R2.requestedVersion,
});

const result = await matrix.runReceiptSpikeMatrix({
  fixtureRoot,
  manifest,
  series,
  planSha256: plan.planSha256,
  integrity: plan.integrity,
  outputRoot: path.resolve(".receipt-spike/runs"),
  readerPrompt: fs.readFileSync("prompts/receipt-spike/reader-v1.md", "utf8"),
  classifierPrompt: fs.readFileSync("prompts/receipt-spike/classifier-v1.md", "utf8"),
  approval,
  openai,
  google,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
