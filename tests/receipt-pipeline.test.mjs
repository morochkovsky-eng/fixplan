import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) { if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true }; return nextResolve(specifier, context); } });
await import("tsx/esm");

const { mergeNormalizedReceipts } = await import("../lib/server/receipt-normalization.ts");
const { runReceiptPipeline } = await import("../lib/server/receipt-pipeline.ts");
const { validateNormalizedReceipt } = await import("../lib/server/receipt-validation.ts");

function field(value, rawText = value === null ? null : String(value), status = value === null ? "missing" : "confirmed", ids = value === null ? [] : ["r1"], reason = null) {
  return { value, rawText, sourceRegionIds: ids, status, reason };
}

function receipt(overrides = {}) {
  return {
    isUtilityDocument: field(true, "Платёжный документ"), documentType: field("housing", "Жилищные услуги"), provider: field("Поставщик", "Поставщик"), referenceAddress: field(null), accountNumber: field(null), billingPeriod: field("2026-08", "август 2026"), issuedDate: field(null), dueDate: field("2026-09-15", "до 15.09.2026"),
    accruedAmount: field(10000, "100,00"), openingDebt: field(0, "0,00"), openingAdvance: field(0, "0,00"), paymentsAppliedToCurrentPeriod: field(0, "0,00"), recalculationAmount: field(0, "0,00"), benefitAmount: field(0, "0,00"), penaltyAmount: field(0, "0,00"), printedMandatoryDue: field(10000, "К оплате 100,00"), mandatoryDue: field(10000, "К оплате 100,00"),
    lastPayment: { amount: field(null), date: field(null) }, lineItems: [], meterEntries: [], optionalCharges: [], warnings: [], ...overrides,
  };
}

function line(id, amount, rowKind = "charge") {
  return { id, rowKind, name: field(`Услуга ${id}`), unit: field("ед."), volume: field(null), tariff: field(null), chargeAmount: field(amount, String(amount)), recalculationAmount: field(0, "0"), benefitAmount: field(0, "0"), totalAmount: field(amount, String(amount)), calculationMode: "printed_total" };
}

function transcription() {
  return { pages: [{ page: 1, rawText: "Квитанция", sections: [{ id: "s1", title: "Услуги", regionIds: ["r1"] }] }], regions: [{ id: "r1", page: 1, kind: "total", rawText: "К оплате 100,00" }], keyValues: [], tables: [], totals: [{ id: "r1", page: 1, label: "К оплате", value: "100,00", rawText: "К оплате 100,00" }], meters: [] };
}

function providerResult(value, model = "test-model") {
  return { provider: "test", model, value, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, latencyMs: 5, failureCode: null, responseId: "r" };
}

test("dense receipts count 19 charge rows but never duplicate section or subtotal rows", () => {
  const lines = Array.from({ length: 19 }, (_, index) => line(`l${index + 1}`, index === 18 ? 1000 : 500));
  lines.push(line("section-total", 10000, "subtotal"));
  const result = validateNormalizedReceipt(receipt({ lineItems: lines }));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.includes("charge_rows_do_not_match_accrual"), false);
});

test("historical lastPayment never reduces the current mandatory amount", () => {
  const result = validateNormalizedReceipt(receipt({ lastPayment: { amount: field(7500000, "Последний платёж 75 000,00"), date: field("2026-05-03", "03.05.2026") } }));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.includes("top_level_balance_conflict"), false);
});

test("missing provider is a review field but does not block a partial draft", () => {
  const result = validateNormalizedReceipt(receipt({ provider: field(null) }));
  assert.equal(result.ok, true);
  assert.ok(result.reviewFields.includes("provider"));
});

test("fallback fills one unresolved field without replacing confirmed first-pass values", async () => {
  const first = receipt({ mandatoryDue: field(null), printedMandatoryDue: field(null) });
  const fallback = receipt({ provider: field("Другая догадка", "Другая догадка", "needs_review", ["r2"], "uncertain"), mandatoryDue: field(10000, "К оплате 100,00", "confirmed", ["r-total"]), printedMandatoryDue: field(10000, "К оплате 100,00", "confirmed", ["r-total"]) });
  let normalizeCalls = 0;
  let fallbackCalls = 0;
  const extractor = {
    provider: "test", transcriptionModel: "vision", normalizationModel: "text",
    async transcribe() { return providerResult(transcription(), "vision"); },
    async transcribeFallback(input) { fallbackCalls += 1; assert.deepEqual(input.unresolvedFields.sort(), ["mandatoryDue", "printedMandatoryDue"]); return providerResult(transcription(), "vision"); },
    async normalize() { return providerResult(normalizeCalls++ === 0 ? first : fallback, "text"); },
  };
  const result = await runReceiptPipeline({ dataUrl: "data:image/jpeg;base64,AA==", filename: "receipt.jpg", mimeType: "image/jpeg" }, { extractor });
  assert.equal(result.ok, true);
  assert.equal(result.fallbackUsed, true);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.receipt.provider.value, "Поставщик");
  assert.equal(result.receipt.mandatoryDue.value, 10000);
});

test("conflicting confirmed fallback evidence is never merged silently", () => {
  const merged = mergeNormalizedReceipts(receipt(), receipt({ provider: field("Другой поставщик", "Другой поставщик", "confirmed", ["r2"]) }));
  assert.equal(merged.provider.value, "Поставщик");
  assert.equal(merged.provider.status, "needs_review");
  assert.equal(merged.provider.reason, "fallback_conflict");
});

test("blank current meter reading remains null and optional service stays outside mandatory due", () => {
  const current = receipt({
    meterEntries: [{ id: "m1", resource: field("ХВС"), meterNumber: field("123"), previousValue: field("10"), currentValue: field(null), consumption: field(null), unit: field("м3"), tariff: field(null) }],
    optionalCharges: [{ id: "o1", label: field("Страхование"), kind: field("insurance"), amount: field(38500, "385,00"), includedInMandatory: field(false, "добровольно") }],
  });
  const result = validateNormalizedReceipt(current);
  assert.equal(result.ok, true);
  assert.equal(result.receipt.meterEntries[0].currentValue.value, null);
  assert.equal(result.receipt.mandatoryDue.value, 10000);
});

test("PDF balance keeps debt, payment, recalculation and penalty in separate signed fields", () => {
  const result = validateNormalizedReceipt(receipt({
    accruedAmount: field(1440563), openingDebt: field(7559021), openingAdvance: field(0), paymentsAppliedToCurrentPeriod: field(7500000), recalculationAmount: field(-25617), benefitAmount: field(0), penaltyAmount: field(8014), printedMandatoryDue: field(1499584), mandatoryDue: field(1499584),
  }));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.includes("top_level_balance_conflict"), false);
});

test("validator also accepts a supplier that applies adjustments outside printed accrual", () => {
  const result = validateNormalizedReceipt(receipt({
    accruedAmount: field(10000), openingDebt: field(0), openingAdvance: field(0), paymentsAppliedToCurrentPeriod: field(0), recalculationAmount: field(-500), benefitAmount: field(0), penaltyAmount: field(100), printedMandatoryDue: field(9600), mandatoryDue: field(9600),
  }));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.includes("top_level_balance_conflict"), false);
});
