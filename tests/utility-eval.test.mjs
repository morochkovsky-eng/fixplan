import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) { if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true }; return nextResolve(specifier, context); } });
await import("tsx/esm");
const utilitySource = readFileSync("lib/server/utility-eval.ts", "utf8");
const routeSource = readFileSync("app/api/internal/utility-eval/route.ts", "utf8");
const utility = await import("../lib/server/utility-eval.ts");

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("utility evaluation authorization requires an exact bearer token", () => {
  assert.equal(utility.isUtilityEvalAuthorized("Bearer expected", "expected"), true);
  assert.equal(utility.isUtilityEvalAuthorized("Bearer wrong", "expected"), false);
  assert.equal(utility.isUtilityEvalAuthorized("expected", "expected"), false);
  assert.equal(utility.isUtilityEvalAuthorized(null, "expected"), false);
  assert.equal(utility.isUtilityEvalAuthorized("Bearer expected", undefined), false);
});

test("utility evaluation accepts only Telegram-compatible files up to 20 MB", () => {
  assert.equal(utility.validateUtilityEvalFile("application/pdf", 10), null);
  assert.equal(utility.validateUtilityEvalFile("image/jpeg", 10), null);
  assert.equal(utility.validateUtilityEvalFile("text/plain", 10), "unsupported_type");
  assert.equal(utility.validateUtilityEvalFile("application/pdf", 0), "empty_file");
  assert.equal(
    utility.validateUtilityEvalFile("application/pdf", 20 * 1024 * 1024 + 1),
    "file_too_large",
  );
});

test("utility evaluation returns the intercepted draft without persistence", async () => {
  const oldApiKey = process.env.OPENAI_API_KEY;
  const oldTranscriptionModel = process.env.OPENAI_RECEIPT_TRANSCRIPTION_MODEL;
  const oldNormalizationModel = process.env.OPENAI_RECEIPT_NORMALIZATION_MODEL;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_RECEIPT_TRANSCRIPTION_MODEL = "test-model";
  process.env.OPENAI_RECEIPT_NORMALIZATION_MODEL = "test-model";
  const requestBodies = [];
  const confirmed = (value, rawText = value === null ? null : String(value)) => ({ value, rawText, sourceRegionIds: value === null ? [] : ["r1"], status: value === null ? "missing" : "confirmed", reason: null });
  const normalized = {
    isUtilityDocument: confirmed(true), documentType: confirmed("electricity"), provider: confirmed("Поставщик"), referenceAddress: confirmed(null), accountNumber: confirmed(null), billingPeriod: confirmed("2026-08"), issuedDate: confirmed(null), dueDate: confirmed(null),
    accruedAmount: confirmed(12345), openingDebt: confirmed(0), openingAdvance: confirmed(0), paymentsAppliedToCurrentPeriod: confirmed(0), recalculationAmount: confirmed(0), benefitAmount: confirmed(0), penaltyAmount: confirmed(0), printedMandatoryDue: confirmed(12345), mandatoryDue: confirmed(12345), lastPayment: { amount: confirmed(null), date: confirmed(null) }, lineItems: [], meterEntries: [], optionalCharges: [{ id: "o1", label: confirmed("Добровольная услуга"), kind: confirmed("other"), amount: confirmed(2500), includedInMandatory: confirmed(false) }], warnings: [],
  };
  const literal = { pages: [{ page: 1, rawText: "Квитанция", sections: [] }], regions: [{ id: "r1", page: 1, kind: "total", rawText: "К оплате 123,45" }], keyValues: [], tables: [], totals: [], meters: [] };
  let step = 0;
  try {
    const result = await utility.runUtilityBillEvaluation(
      {
        bytes: new Uint8Array([1, 2, 3]),
        filename: "bill.pdf",
        mimeType: "application/pdf",
        insuranceIncluded: false,
        currency: "RUB",
      },
      async (_url, init) => {
        requestBodies.push(JSON.parse(String(init.body)));
        return Response.json({ id: `resp_${step}`, model: "test-model", output_text: JSON.stringify(step++ === 0 ? literal : normalized), usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } });
      },
    );
    assert.equal(result.responseId, null);
    assert.deepEqual(result.models, ["test-model"]);
    assert.equal(result.draft.periodChargeAmount, "123.45");
    assert.equal(result.draft.optionalCharges[0].includedInMandatory, false);
    assert.equal(result.question, null);
    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0].text.format.name, "receipt_visual_transcription");
    assert.equal(requestBodies[0].input[0].content[1].detail, "auto");
    assert.equal(requestBodies[0].max_output_tokens, 14000);
    assert.equal(requestBodies[1].text.format.name, "receipt_semantic_normalization");
    assert.equal(requestBodies[1].max_output_tokens, 10000);
    assert.equal(requestBodies.some((body) => body.tools), false);
  } finally {
    restoreEnvironment("OPENAI_API_KEY", oldApiKey);
    restoreEnvironment("OPENAI_RECEIPT_TRANSCRIPTION_MODEL", oldTranscriptionModel);
    restoreEnvironment("OPENAI_RECEIPT_NORMALIZATION_MODEL", oldNormalizationModel);
  }
});

test("utility evaluation reports a blocking question when no draft is safe", async () => {
  const oldApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const result = await utility.runUtilityBillEvaluation(
      { bytes: new Uint8Array([1]), filename: "bill.jpg", mimeType: "image/jpeg" },
      async () => Response.json({ id: "resp_question", output_text: "" }),
    );
    assert.equal(result.draft, null);
    assert.match(result.question, /empty_output/i);
  } finally {
    restoreEnvironment("OPENAI_API_KEY", oldApiKey);
  }
});

test("the internal route is production-disabled before auth or body parsing", () => {
  const productionCheck = routeSource.indexOf('process.env.VERCEL_ENV === "production"');
  const secretRead = routeSource.indexOf("process.env.UTILITY_EVAL_TOKEN");
  const bodyRead = routeSource.indexOf("request.formData()");
  assert.ok(productionCheck >= 0);
  assert.ok(productionCheck < secretRead);
  assert.ok(secretRead < bodyRead);
  assert.match(routeSource, /return json\(\{ error: "not_found" \}, 404\)/);
});

test("the no-write evaluation path has no data or logging dependencies", () => {
  const sources = utilitySource + routeSource;
  assert.doesNotMatch(sources, /supabase/i);
  assert.doesNotMatch(sources, /\.storage\b/);
  assert.doesNotMatch(sources, /console\.(?:log|error)/);
  assert.doesNotMatch(sources, /telegram_conversations|utility_bills/);
  assert.match(routeSource, /cache-control": "no-store"/);
});
