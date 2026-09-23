import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const utilitySource = readFileSync("lib/server/utility-eval.ts", "utf8");
const routeSource = readFileSync("app/api/internal/utility-eval/route.ts", "utf8");

const transpiled = ts.transpile(utilitySource, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
}).replace('import "server-only";\n', "");
const utility = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);

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
  const oldModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";
  let requestBody;
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
        requestBody = JSON.parse(String(init.body));
        return Response.json({
          id: "resp_test",
          output: [{
            type: "function_call",
            name: "prepare_utility_bill",
            call_id: "call_test",
            arguments: JSON.stringify({
              service: "Электричество",
              documentKind: "electricity",
              providerName: "Поставщик",
              documentAddress: "",
              accountNumber: "",
              periodMonth: "2026-08",
              period: "Август 2026",
              documentDate: "2026-09-01",
              dueDate: "",
              periodChargeAmount: "123.45",
              openingDebtAmount: "",
              openingCreditAmount: "",
              paidAmount: "",
              recalculationAmount: "",
              benefitAmount: "",
              penaltyAmount: "",
              mandatoryDueAmount: "123.45",
              printedDueAmount: "123.45",
              allocation: "tenant",
              lineItems: [],
              meters: [],
              optionalCharges: [{ label: "Добровольная услуга", kind: "other", amount: "25.00", includedInMandatory: false }],
              warnings: [],
              note: "",
              quality: {
                readable: true,
                issues: [],
                criticalFields: [
                  { field: "document_kind", confidence: "high", evidence: "Счёт" },
                  { field: "billing_period", confidence: "high", evidence: "Август 2026" },
                  { field: "period_charge", confidence: "high", evidence: "Начислено 123,45" },
                  { field: "mandatory_due", confidence: "high", evidence: "К оплате 123,45" },
                  { field: "due_date", confidence: "absent", evidence: null },
                  { field: "provider", confidence: "high", evidence: "Поставщик" },
                ],
              },
            }),
          }],
        });
      },
    );
    assert.equal(result.responseId, "resp_test");
    assert.equal(result.model, "test-model");
    assert.equal(result.draft.periodChargeAmount, "123.45");
    assert.equal(result.draft.optionalCharges[0].includedInMandatory, false);
    assert.equal(result.question, null);
    assert.equal(requestBody.tools.length, 1);
    assert.equal(requestBody.tools[0].name, "prepare_utility_bill");
    assert.equal(requestBody.tool_choice, "auto");
    assert.equal(requestBody.max_output_tokens, 2200);
    assert.match(requestBody.instructions, /ничего не сохраняй/i);
    assert.match(requestBody.instructions, /исключать/);
  } finally {
    restoreEnvironment("OPENAI_API_KEY", oldApiKey);
    restoreEnvironment("OPENAI_MODEL", oldModel);
  }
});

test("utility evaluation reports a blocking question when no draft is safe", async () => {
  const oldApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const result = await utility.runUtilityBillEvaluation(
      { bytes: new Uint8Array([1]), filename: "bill.jpg", mimeType: "image/jpeg" },
      async () => Response.json({ id: "resp_question", output_text: "Какое начисление относится к текущему периоду?" }),
    );
    assert.equal(result.draft, null);
    assert.equal(result.question, "Какое начисление относится к текущему периоду?");
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
