import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return nextResolve(specifier, context);
} });
await import("tsx/esm");
const core = await import("../lib/server/receipt-core/index.ts");

const root = path.resolve("tests/fixtures/receipt-synthetic-v1.1/oracle");
const documents = [];

for (const filename of fs.readdirSync(path.join(root, "semantic")).sort()) {
  const semantic = JSON.parse(fs.readFileSync(path.join(root, "semantic", filename), "utf8"));
  const literal = JSON.parse(fs.readFileSync(path.join(root, "literal_source", filename), "utf8"));
  const result = core.processReceiptBundle(core.indexLiteralDocument(literal), semantic.roleClassification);
  for (const document of result.documents) {
    const expected = semantic.documents.find((entry) => entry.docId === document.docId)?.expected;
    if (!expected) throw new Error(`Missing semantic expectation for ${document.docId}`);
    const actual = {
      decision: document.result.draft.decision,
      billingPeriod: document.result.receipt.period.value,
      mandatoryDue: {
        valueMinor: document.result.mandatoryDue.valueMinor?.toString() ?? null,
        status: document.result.mandatoryDue.status,
        source: document.result.mandatoryDue.source,
      },
      computedDueMinor: document.result.computedDue?.toString() ?? null,
      computedClosingBalanceMinor: document.result.computedClosingBalance?.toString() ?? null,
      reasons: document.result.draft.reasons,
    };
    const decisionMatch = actual.decision === expected.decision &&
      actual.billingPeriod === expected.billingPeriod &&
      actual.mandatoryDue.valueMinor === expected.mandatoryDue.valueMinor &&
      actual.mandatoryDue.status === expected.mandatoryDue.status &&
      actual.mandatoryDue.source === expected.mandatoryDue.source &&
      actual.computedDueMinor === expected.computedDueMinor &&
      actual.computedClosingBalanceMinor === expected.computedClosingBalanceMinor;
    documents.push({ fileId: semantic.fileId, docId: document.docId, expected, actual, decisionMatch });
  }
}

const actualTotals = {
  confirmed_draft: documents.filter((entry) => entry.actual.decision === "confirmed_draft").length,
  partial_draft: documents.filter((entry) => entry.actual.decision === "partial_draft").length,
};
const report = {
  coreCommit: process.env.CORE_SHA ?? "working-tree",
  fixture: "homory-synthetic-v1.1-rev2",
  decisionSource: "oracle/semantic",
  legacyGoldUsed: false,
  documents,
  summary: {
    decisionMatches: documents.filter((entry) => entry.decisionMatch).length,
    documentCount: documents.length,
    expectedTotals: { confirmed_draft: 8, partial_draft: 3 },
    actualTotals,
    silentConfirmedErrors: documents.filter((entry) => entry.actual.decision === "confirmed_draft" && !entry.decisionMatch).length,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
