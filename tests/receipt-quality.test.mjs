import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import sharp from "sharp";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
await import("tsx/esm");
const { analyzeReceiptAttachment, validateReceiptArithmetic, validateReceiptReadability } = await import("../lib/server/receipt-quality.ts");

function quality(overrides = {}) {
  return {
    readable: true,
    issues: [],
    criticalFields: [
      { field: "document_kind", confidence: "high", evidence: "Квитанция" },
      { field: "billing_period", confidence: "high", evidence: "Март 2026" },
      { field: "period_charge", confidence: "high", evidence: "Начислено 100,00" },
      { field: "mandatory_due", confidence: "high", evidence: "К оплате 100,00" },
      { field: "due_date", confidence: "absent", evidence: null },
      { field: "provider", confidence: "high", evidence: "Поставщик" },
    ],
    ...overrides,
  };
}

test("technical image concerns are combined instead of using one size threshold", () => {
  const args = { quality: quality() };
  assert.deepEqual(validateReceiptReadability(args, {
    sourceType: "photo", byteSize: 90_000, width: 600, height: 1000,
    sharpness: 3, brightness: 120, contrast: 18, brightPixelRatio: 0.02, darkPixelRatio: 0.03,
  }), {
    ok: false,
    reason: "receipt_quality_rejected",
    issues: ["technical_image_quality_low"],
  });
  assert.deepEqual(validateReceiptReadability(args, {
    sourceType: "photo", byteSize: 800_000, width: 900, height: 1400,
    sharpness: 16, brightness: 130, contrast: 45, brightPixelRatio: 0.03, darkPixelRatio: 0.03,
  }), { ok: true });
});

test("a synthetic heavily compressed flat image is measured as unreadable", async () => {
  const bytes = await sharp({
    create: { width: 520, height: 820, channels: 3, background: { r: 35, g: 35, b: 35 } },
  }).blur(12).jpeg({ quality: 8 }).toBuffer();
  const attachment = await analyzeReceiptAttachment(bytes, "image/jpeg", "photo");
  const result = validateReceiptReadability({ quality: quality() }, attachment);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(","), /technical_image_quality_low/);
});

test("missing evidence for a critical field blocks a confident-looking draft", () => {
  const criticalFields = quality().criticalFields.map((item) =>
    item.field === "mandatory_due" ? { ...item, confidence: "unreadable", evidence: null } : item,
  );
  const result = validateReceiptReadability({ quality: quality({ criticalFields }) });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(","), /critical_mandatory_due_unreadable/);
});

test("arithmetic accepts ordinary rounding and rejects unexplained contradictions", () => {
  assert.deepEqual(validateReceiptArithmetic({
    periodChargeAmount: "19.99", mandatoryDueAmount: "19.99", printedDueAmount: "19.99",
    lineItems: [{ volume: "3.33", tariff: "6.00", chargeAmount: "19.98", totalAmount: "19.99" }],
    optionalCharges: [],
  }), { ok: true });

  const mismatch = validateReceiptArithmetic({
    periodChargeAmount: "100.00", mandatoryDueAmount: "160.00", printedDueAmount: "160.00",
    lineItems: [{ volume: "10", tariff: "10", chargeAmount: "100.00", totalAmount: "100.00" }],
    optionalCharges: [],
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.issues.join(","), /top_level_amounts_do_not_reconcile/);
});

test("a voluntary charge cannot be folded into the mandatory total", () => {
  const result = validateReceiptArithmetic({
    periodChargeAmount: "100.00", mandatoryDueAmount: "125.00", printedDueAmount: "125.00",
    optionalCharges: [{ amount: "25.00", includedInMandatory: false }],
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(","), /optional_charge_included_in_mandatory_due/);
});
