import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
await import("tsx/esm");
const { analyzeReceiptAttachment, prepareReceiptRecognitionImages, validateReceiptArithmetic, validateReceiptReadability } = await import("../lib/server/receipt-quality.ts");

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
    sourceType: "photo", mediaKind: "image", byteSize: 90_000, width: 600, height: 1000,
    pageCount: 1, sharpness: 3, brightness: 120, contrast: 18, brightPixelRatio: 0.02, darkPixelRatio: 0.03, analysisError: null,
  }), { ok: true });
  assert.deepEqual(validateReceiptReadability(args, {
    sourceType: "photo", mediaKind: "image", byteSize: 800_000, width: 900, height: 1400,
    pageCount: 1, sharpness: 16, brightness: 130, contrast: 45, brightPixelRatio: 0.03, darkPixelRatio: 0.03, analysisError: null,
  }), { ok: true });
  assert.deepEqual(validateReceiptReadability(args, {
    sourceType: "photo", mediaKind: "image", byteSize: 240_000, width: 1280, height: 960,
    pageCount: 1, sharpness: 12, brightness: 128, contrast: 38, brightPixelRatio: 0.04, darkPixelRatio: 0.04, analysisError: null,
  }), { ok: true });
});

test("a synthetic heavily compressed flat image is measured as unreadable", async () => {
  const bytes = await sharp({
    create: { width: 520, height: 820, channels: 3, background: { r: 35, g: 35, b: 35 } },
  }).blur(12).jpeg({ quality: 8 }).toBuffer();
  const attachment = await analyzeReceiptAttachment(bytes, "image/jpeg", "photo");
  const result = validateReceiptReadability({ quality: quality() }, attachment);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(","), /technical_image_detail_destroyed|technical_image_content_missing/);

  const shortPdf = await PDFDocument.create();
  shortPdf.addPage();
  shortPdf.addPage();
  const pdfQuality = await analyzeReceiptAttachment(await shortPdf.save(), "application/pdf", "document");
  assert.equal(pdfQuality.mediaKind, "pdf");
  assert.equal(pdfQuality.pageCount, 2);
  assert.equal(pdfQuality.sharpness, null);
  assert.deepEqual(validateReceiptReadability({ quality: quality() }, pdfQuality), { ok: true });

  const longPdf = await PDFDocument.create();
  for (let index = 0; index < 31; index += 1) longPdf.addPage();
  const longPdfQuality = await analyzeReceiptAttachment(await longPdf.save(), "application/pdf", "document");
  const longPdfResult = validateReceiptReadability({ quality: quality() }, longPdfQuality);
  assert.equal(longPdfResult.ok, false);
  assert.match(longPdfResult.issues.join(","), /technical_pdf_page_limit_exceeded/);
});

test("a readable 2048x1453 JPEG with a large blank region is enhanced without format rejection", async () => {
  const receipt = await sharp({
    create: { width: 2048, height: 1453, channels: 3, background: "white" },
  }).composite([{ input: Buffer.from(`
    <svg width="2048" height="700" xmlns="http://www.w3.org/2000/svg">
      <rect width="2048" height="700" fill="white"/>
      <g fill="#111" font-family="Arial" font-size="54">
        <text x="90" y="100">Квитанция за Август 2026</text>
        <text x="90" y="190">Капитальный ремонт</text>
        <text x="90" y="280">39 м2 x 16,32 = 636,48</text>
        <text x="90" y="370">Начислено 636,48</text>
        <text x="90" y="460">К ОПЛАТЕ 636,48</text>
        <text x="90" y="550">Срок оплаты 25.09.2026</text>
      </g>
    </svg>`), top: 0, left: 0 }]).jpeg({ quality: 82 }).toBuffer();
  const metrics = await analyzeReceiptAttachment(receipt, "image/jpeg", "photo");
  assert.equal(metrics.width, 2048);
  assert.equal(metrics.height, 1453);
  assert.equal(metrics.analysisError, null);
  assert.ok(metrics.contentCoverage > 0);
  assert.ok(metrics.contentCoverage < 0.8);
  assert.deepEqual(validateReceiptReadability({ quality: quality() }, metrics), { ok: true });
  const prepared = await prepareReceiptRecognitionImages(receipt, "image/jpeg");
  assert.match(prepared.primaryDataUrl, /^data:image\/jpeg;base64,/u);
  assert.equal(prepared.targetedDataUrls.length, 3);
  assert.equal(await prepareReceiptRecognitionImages(await PDFDocument.create().then((pdf) => pdf.save()), "application/pdf"), null);
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
    lineItems: [{ calculationMode: "simple", volume: "3.33", tariff: "6.00", chargeAmount: "19.98", totalAmount: "19.99" }],
    optionalCharges: [],
  }), { ok: true });

  const mismatch = validateReceiptArithmetic({
    periodChargeAmount: "100.00", mandatoryDueAmount: "160.00", printedDueAmount: "160.00",
    lineItems: [{ calculationMode: "simple", volume: "10", tariff: "10", chargeAmount: "100.00", totalAmount: "100.00" }],
    optionalCharges: [],
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.issues.join(","), /top_level_amounts_do_not_reconcile/);

  assert.deepEqual(validateReceiptArithmetic({
    periodChargeAmount: "100.00", mandatoryDueAmount: "100.00",
    lineItems: [{ calculationMode: "composite", volume: "10", tariff: "3.00", chargeAmount: "100.00", totalAmount: "100.00" }],
    optionalCharges: [],
  }), { ok: true });
});

test("a voluntary charge cannot be folded into the mandatory total", () => {
  const result = validateReceiptArithmetic({
    periodChargeAmount: "100.00", mandatoryDueAmount: "125.00", printedDueAmount: "125.00",
    optionalCharges: [{ amount: "25.00", includedInMandatory: false }],
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(","), /optional_charge_included_in_mandatory_due/);
});
