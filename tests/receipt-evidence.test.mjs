import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) { if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true }; return nextResolve(specifier, context); } });
await import("tsx/esm");

const { verifyReceiptEvidence } = await import("../lib/server/receipt-evidence.ts");
const { validateNormalizedReceipt } = await import("../lib/server/receipt-validation.ts");
const { runReceiptPipeline } = await import("../lib/server/receipt-pipeline.ts");

function field(value, rawText = value === null ? null : String(value), ids = value === null ? [] : ["financial"], status = value === null ? "missing" : "confirmed") {
  return { value, rawText, sourceRegionIds: ids, status, reason: status === "confirmed" ? null : "not_printed" };
}

function baseReceipt(overrides = {}) {
  return {
    isUtilityDocument: field(true, "Квитанция", ["identity"]), documentType: field("housing", "Жилищные услуги", ["identity"]), provider: field(null), referenceAddress: field(null), accountNumber: field(null), billingPeriod: field("2026-08", "август 2026", ["period"]), issuedDate: field(null), dueDate: field(null),
    accruedAmount: field(10000, "100,00"), openingDebt: field(null), openingAdvance: field(null), paymentsAppliedToCurrentPeriod: field(null), recalculationAmount: field(null), benefitAmount: field(null), penaltyAmount: field(null), printedMandatoryDue: field(10000, "100,00"), mandatoryDue: field(10000, "100,00"),
    lastPayment: { amount: field(null), date: field(null) }, financialComponents: [], lineItems: [], meterEntries: [], optionalCharges: [], warnings: [], ...overrides,
  };
}

function region(id, sectionType, rawText, kind = "table_row", value = rawText, allowsMultipleEntities = false) {
  return { id, page: 1, kind, sectionType, label: rawText, value, rawText, bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.05 }, allowsMultipleEntities };
}

function transcription(extra = []) {
  return { pages: [], regions: [], keyValues: [], tables: [], totals: [], meters: [], evidence: [region("identity", "identity", "Квитанция Жилищные услуги", "heading"), region("period", "billing_period", "август 2026", "key_value"), region("financial", "financial_summary", "К оплате 100,00", "total", "100,00", true), ...extra] };
}

function line(id, sourceId, amount = 10000) {
  return { id, rowKind: "charge", name: field("Услуга", "Услуга", [sourceId]), unit: field(null), volume: field(null), tariff: field(null), chargeAmount: field(amount, "100,00", [sourceId]), recalculationAmount: field(null), benefitAmount: field(null), totalAmount: field(amount, "100,00", [sourceId]), calculationMode: "printed_total" };
}

function meter(id, sourceId, currentValue = null) {
  return { id, resource: field("Вода", "Вода", [sourceId]), meterNumber: field(null), previousValue: field(null), currentValue: field(currentValue, currentValue, currentValue === null ? [] : [sourceId]), consumption: field(null), unit: field(null), tariff: field(null) };
}

test("a normative near a meter is not accepted as a reading", () => {
  const current = baseReceipt({ meterEntries: [meter("m1", "norm", "12,3")] });
  const checked = verifyReceiptEvidence(current, transcription([region("norm", "reference", "Норматив 12,3", "reference", "12,3")])).receipt;
  assert.equal(checked.meterEntries.length, 0);
});

test("a blank meter cell never receives an invented value", () => {
  const current = baseReceipt({ meterEntries: [meter("m1", "blank", "42")] });
  current.meterEntries[0].currentValue.rawText = "Текущие показания";
  const checked = verifyReceiptEvidence(current, transcription([region("blank", "meter_table", "Текущие показания", "table_cell", null)])).receipt;
  assert.equal(checked.meterEntries.length, 0);
});

test("a section heading and subtotal cannot become charge rows", () => {
  const current = baseReceipt({ lineItems: [line("heading", "heading"), line("subtotal", "subtotal")] });
  const checked = verifyReceiptEvidence(current, transcription([region("heading", "service_table", "Услуга 100,00", "heading", "100,00"), region("subtotal", "service_table", "Итого 100,00", "total", "100,00")])).receipt;
  assert.deepEqual(checked.lineItems, []);
});

test("one non-composite region cannot confirm two different entities", () => {
  const current = baseReceipt({ lineItems: [line("a", "row"), line("b", "row")] });
  const checked = verifyReceiptEvidence(current, transcription([region("row", "service_table", "Услуга 100,00", "table_row", "100,00")])).receipt;
  assert.equal(checked.lineItems.length, 1);
  assert.equal(checked.lineItems[0].id, "a");
});

test("a number without a source region or literal transcription is rejected", () => {
  const noSource = baseReceipt({ mandatoryDue: field(12345, "123,45", []) });
  assert.equal(verifyReceiptEvidence(noSource, transcription()).receipt.mandatoryDue.status, "needs_review");
  const invented = baseReceipt({ mandatoryDue: field(12345, "123,45", ["financial"]) });
  assert.equal(verifyReceiptEvidence(invented, transcription()).receipt.mandatoryDue.status, "needs_review");
});

test("ambiguous financial components remain review-only", () => {
  const current = baseReceipt({ financialComponents: [{ id: "adjustment", role: "recalculation", label: field("Корректировка", "Корректировка"), signedAmount: field(-500, "-5,00"), affectsMandatoryDue: field(null, null, [], "needs_review") }] });
  const result = validateNormalizedReceipt(current);
  assert.ok(result.warnings.includes("financial_formula_needs_review"));
});

function providerResult(value, model) {
  return { provider: "test", model, value, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1, failureCode: null, responseId: "id" };
}

test("one deadline is shared between stages and cancels before normalization", async () => {
  let clock = 0;
  let normalizeCalls = 0;
  const extractor = { provider: "test", transcriptionModel: "vision", normalizationModel: "text", async transcribe() { clock = 11; return providerResult(transcription(), "vision"); }, async normalize() { normalizeCalls += 1; return providerResult(baseReceipt(), "text"); }, async transcribeFallback() { throw new Error("not expected"); } };
  const result = await runReceiptPipeline({ dataUrl: "data:image/jpeg;base64,AA==", filename: "x.jpg", mimeType: "image/jpeg" }, { extractor, deadlineMs: 10, now: () => clock });
  assert.equal(result.failureCode, "pipeline_deadline_exceeded");
  assert.equal(normalizeCalls, 0);
});

test("fallback is not launched without a safe remaining budget", async () => {
  let clock = 0;
  let fallbackCalls = 0;
  const unresolved = baseReceipt({ mandatoryDue: field(null), printedMandatoryDue: field(null) });
  const extractor = { provider: "test", transcriptionModel: "vision", normalizationModel: "text", async transcribe() { return providerResult(transcription(), "vision"); }, async normalize() { clock = 10_001; return providerResult(unresolved, "text"); }, async transcribeFallback() { fallbackCalls += 1; return providerResult(transcription(), "vision"); } };
  const result = await runReceiptPipeline({ dataUrl: "data:image/jpeg;base64,AA==", filename: "x.jpg", mimeType: "image/jpeg" }, { extractor, deadlineMs: 50_000, now: () => clock });
  assert.equal(result.failureCode, "pipeline_deadline_insufficient_for_fallback");
  assert.equal(fallbackCalls, 0);
});
