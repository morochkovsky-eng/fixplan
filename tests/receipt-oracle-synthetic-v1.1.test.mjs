import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return nextResolve(specifier, context);
} });
await import("tsx/esm");
const core = await import("../lib/server/receipt-core/index.ts");

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/receipt-synthetic-v1.1/oracle");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runOracle() {
  const results = [];
  for (const filename of fs.readdirSync(path.join(fixtureRoot, "semantic")).sort()) {
    const semantic = readJson(path.join(fixtureRoot, "semantic", filename));
    const literal = readJson(path.join(fixtureRoot, "literal_source", filename));
    const bundle = core.processReceiptBundle(core.indexLiteralDocument(literal), semantic.roleClassification);
    for (const document of bundle.documents) {
      const expected = semantic.documents.find((entry) => entry.docId === document.docId)?.expected;
      assert.ok(expected, `missing semantic expectation for ${document.docId}`);
      results.push({ fileId: semantic.fileId, document, expected });
    }
  }
  return results;
}

test("synthetic-v1.1 semantic oracle produces all expected deterministic decisions", () => {
  const results = runOracle();
  assert.equal(results.length, 11);
  for (const { document, expected } of results) {
    const result = document.result;
    assert.equal(result.draft.decision, expected.decision, `${document.docId} decision`);
    assert.ok(!(expected.forbiddenDecisions ?? []).includes(result.draft.decision), `${document.docId} forbidden decision`);
    assert.equal(result.receipt.period.value, expected.billingPeriod, `${document.docId} period`);
    assert.equal(result.mandatoryDue.valueMinor?.toString() ?? null, expected.mandatoryDue.valueMinor, `${document.docId} due`);
    assert.equal(result.mandatoryDue.status, expected.mandatoryDue.status, `${document.docId} due status`);
    assert.equal(result.mandatoryDue.source, expected.mandatoryDue.source, `${document.docId} due source`);
    assert.equal(result.computedDue?.toString() ?? null, expected.computedDueMinor, `${document.docId} computed due`);
    assert.equal(result.computedClosingBalance?.toString() ?? null, expected.computedClosingBalanceMinor, `${document.docId} closing balance`);
  }
  assert.equal(results.filter(({ document }) => document.result.draft.decision === "confirmed_draft").length, 8);
  assert.equal(results.filter(({ document }) => document.result.draft.decision === "partial_draft").length, 3);
});

test("synthetic-v1.1 has no silent confirmed error and keeps S07/S10 review-only", () => {
  const results = runOracle();
  const silentConfirmed = results.filter(({ document, expected }) => document.result.draft.decision === "confirmed_draft" && (
    document.result.receipt.period.value !== expected.billingPeriod ||
    document.result.mandatoryDue.valueMinor?.toString() !== expected.mandatoryDue.valueMinor
  ));
  assert.deepEqual(silentConfirmed, []);
  for (const docId of ["S07-D1", "S07-D2", "S10-D1"]) {
    const result = results.find(({ document }) => document.docId === docId)?.document.result;
    assert.equal(result?.draft.decision, "partial_draft");
    assert.equal(result?.mandatoryDue.status, "needs_review");
  }
  for (const docId of ["S07-D1", "S07-D2"]) {
    const result = results.find(({ document }) => document.docId === docId)?.document.result;
    assert.equal(result?.receipt.accruedTotal.value, null);
    assert.ok(result?.draft.reasons.includes("due_reconciliation_insufficient"));
  }
});
