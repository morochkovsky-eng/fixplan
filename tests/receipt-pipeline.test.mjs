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
    isUtilityDocument: field(true, "Платёжный документ", "confirmed", ["identity"]), documentType: field("housing", "Жилищные услуги", "confirmed", ["identity"]), provider: field("Поставщик", "Поставщик", "confirmed", ["identity"]), referenceAddress: field(null), accountNumber: field(null), billingPeriod: field("2026-08", "август 2026", "confirmed", ["period"]), issuedDate: field(null), dueDate: field("2026-09-15", "до 15.09.2026", "confirmed", ["due"]),
    accruedAmount: field(10000, "100,00", "confirmed", ["financial"]), openingDebt: field(0, "0,00", "confirmed", ["financial"]), openingAdvance: field(0, "0,00", "confirmed", ["financial"]), paymentsAppliedToCurrentPeriod: field(0, "0,00", "confirmed", ["financial"]), recalculationAmount: field(0, "0,00", "confirmed", ["financial"]), benefitAmount: field(0, "0,00", "confirmed", ["financial"]), penaltyAmount: field(0, "0,00", "confirmed", ["financial"]), printedMandatoryDue: field(10000, "К оплате 100,00", "confirmed", ["financial"]), mandatoryDue: field(10000, "К оплате 100,00", "confirmed", ["financial"]),
    lastPayment: { amount: field(null), date: field(null) }, financialComponents: [], lineItems: [], meterEntries: [], optionalCharges: [], warnings: [], ...overrides,
  };
}

function line(id, amount, rowKind = "charge") {
  return { id, rowKind, name: field(`Услуга ${id}`), unit: field("ед."), volume: field(null), tariff: field(null), chargeAmount: field(amount, String(amount)), recalculationAmount: field(0, "0"), benefitAmount: field(0, "0"), totalAmount: field(amount, String(amount)), calculationMode: "printed_total" };
}

function transcription() {
  const bbox = { x: 0.1, y: 0.1, width: 0.5, height: 0.05 };
  const evidence = [
    { id: "identity", page: 1, kind: "heading", sectionType: "identity", label: "Платёжный документ", value: "Жилищные услуги Поставщик", rawText: "Платёжный документ Жилищные услуги Поставщик", bbox, allowsMultipleEntities: true },
    { id: "period", page: 1, kind: "key_value", sectionType: "billing_period", label: "Период", value: "август 2026", rawText: "Период август 2026", bbox, allowsMultipleEntities: false },
    { id: "due", page: 1, kind: "key_value", sectionType: "financial_summary", label: "Срок", value: "15.09.2026", rawText: "до 15.09.2026", bbox, allowsMultipleEntities: false },
    { id: "due-region", page: 1, kind: "key_value", sectionType: "financial_summary", label: "Срок", value: "25.09.2026", rawText: "25.09.2026", bbox, allowsMultipleEntities: false },
    { id: "financial", page: 1, kind: "total", sectionType: "financial_summary", label: "К оплате", value: "100,00 0,00", rawText: "К оплате 100,00; долг 0,00; оплачено 0,00; перерасчёт 0,00; пени 0,00", bbox, allowsMultipleEntities: true },
    { id: "r-total", page: 1, kind: "total", sectionType: "financial_summary", label: "К оплате", value: "100,00", rawText: "К оплате 100,00", bbox, allowsMultipleEntities: true },
  ];
  return { pages: [{ page: 1, rawText: "Квитанция", sections: [{ id: "s1", title: "Услуги", regionIds: ["financial"] }] }], regions: [{ id: "financial", page: 1, kind: "total", rawText: "К оплате 100,00" }], keyValues: [], tables: [], totals: [{ id: "financial", page: 1, label: "К оплате", value: "100,00", rawText: "К оплате 100,00" }], meters: [], evidence };
}

function component(id, role, amount, affectsMandatoryDue, label = role) {
  return { id, role, label: field(label, label), signedAmount: field(amount, String(amount)), affectsMandatoryDue: field(affectsMandatoryDue, affectsMandatoryDue ? "входит" : "справочно") };
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

test("printed financial components reproduce different supplier formulas without a universal sign formula", () => {
  const scenarios = [
    receipt({ mandatoryDue: field(505623), printedMandatoryDue: field(505623), financialComponents: [component("a", "accrued", 509199, true), component("advance", "opening_advance", -3576, true)] }),
    receipt({ mandatoryDue: field(259649), printedMandatoryDue: field(259649), financialComponents: [component("a", "accrued", 406622, true), component("advance", "opening_advance", -146973, true)] }),
    receipt({ mandatoryDue: field(1499584), printedMandatoryDue: field(1499584), financialComponents: [component("a", "accrued", 1440563, true), component("debt", "opening_debt", 7559021, true), component("payment", "current_payment", -7500000, true), component("recalc", "recalculation", -25617, false), component("penalty", "penalty", 8014, false)] }),
  ];
  for (const current of scenarios) {
    const result = validateNormalizedReceipt(current);
    assert.equal(result.ok, true);
    assert.equal(result.warnings.includes("printed_financial_formula_conflict"), false);
  }
});

test("a missing printed due date gets one header-only targeted pass without full fallback", async () => {
  const first = receipt({ dueDate: field(null) });
  const due = receipt({ dueDate: field("2026-09-25", "25.09.2026", "confirmed", ["due-region"]) });
  let normalizeCalls = 0;
  let targetedCalls = 0;
  const extractor = {
    provider: "test", transcriptionModel: "vision", normalizationModel: "text",
    async transcribe() { return providerResult(transcription(), "vision"); },
    async transcribeFallback(input) { targetedCalls += 1; assert.deepEqual(input.unresolvedFields, ["dueDate"]); assert.deepEqual(input.targetedDataUrls, ["data:image/jpeg;base64,HEADER"]); return providerResult(transcription(), "vision"); },
    async normalize() { return providerResult(normalizeCalls++ === 0 ? first : due, "text"); },
  };
  const result = await runReceiptPipeline({ dataUrl: "data:image/jpeg;base64,AA==", targetedDataUrls: ["data:image/jpeg;base64,HEADER", "data:image/jpeg;base64,TABLE"], filename: "receipt.jpg", mimeType: "image/jpeg" }, { extractor });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.dueDate.value, "2026-09-25");
  assert.equal(targetedCalls, 1);
  assert.deepEqual(result.attempts.map((item) => item.stage), ["transcription", "normalization", "due_date_transcription", "due_date_normalization"]);
});
