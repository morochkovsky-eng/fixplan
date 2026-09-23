import { moneyToMinor } from "@/lib/server/receipt-money";

export type ReceiptAttachmentQuality = {
  sourceType: "photo" | "document";
  mediaKind: "image" | "pdf" | "other";
  byteSize: number;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  sharpness: number | null;
  brightness: number | null;
  contrast: number | null;
  brightPixelRatio: number | null;
  darkPixelRatio: number | null;
  analysisError: "decode_failed" | null;
};

export type ReceiptValidationFailure = {
  ok: false;
  reason: "receipt_quality_rejected" | "receipt_arithmetic_invalid";
  issues: string[];
};

const criticalFields = [
  "document_kind",
  "billing_period",
  "period_charge",
  "mandatory_due",
  "due_date",
  "provider",
] as const;

const mayBeAbsent = new Set(["due_date", "provider"]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function arrayObjects(value: unknown) {
  return Array.isArray(value)
    ? value.map(objectValue).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function decimalRatio(value: unknown): { numerator: bigint; scale: bigint } | null {
  const normalized = String(value ?? "").trim().replace(/\s+/gu, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const scale = BigInt(10) ** BigInt(fraction.length);
  const numerator = BigInt(whole) * scale + BigInt(fraction || "0");
  return { numerator: negative ? -numerator : numerator, scale };
}

function roundedProductMinor(left: unknown, right: unknown) {
  const a = decimalRatio(left);
  const b = decimalRatio(right);
  if (!a || !b) return null;
  const numerator = a.numerator * b.numerator * BigInt(100);
  const denominator = a.scale * b.scale;
  const negative = numerator < BigInt(0);
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / BigInt(2)) / denominator;
  return negative ? -rounded : rounded;
}

function differenceTooLarge(left: bigint, right: bigint, tolerance = BigInt(2)) {
  const difference = left - right;
  return (difference < BigInt(0) ? -difference : difference) > tolerance;
}

export async function analyzeReceiptAttachment(
  bytes: Uint8Array,
  mimeType: string,
  sourceType: "photo" | "document",
): Promise<ReceiptAttachmentQuality> {
  const base = {
    sourceType,
    mediaKind: mimeType.startsWith("image/") ? "image" as const
      : mimeType === "application/pdf" ? "pdf" as const : "other" as const,
    byteSize: bytes.byteLength,
    width: null,
    height: null,
    pageCount: null,
    sharpness: null,
    brightness: null,
    contrast: null,
    brightPixelRatio: null,
    darkPixelRatio: null,
    analysisError: null,
  } satisfies ReceiptAttachmentQuality;
  if (mimeType === "application/pdf") {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.load(bytes, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        updateMetadata: false,
      });
      return { ...base, pageCount: document.getPageCount() };
    } catch {
      return { ...base, analysisError: "decode_failed" };
    }
  }
  if (!mimeType.startsWith("image/")) return base;

  try {
    const { default: sharp } = await import("sharp");
    const image = sharp(bytes, {
      failOn: "none",
      limitInputPixels: 40_000_000,
      pages: 1,
      sequentialRead: true,
    }).rotate();
    const metadata = await image.metadata();
    const sample = image.clone().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).greyscale();
    const stats = await sample.stats();
    const { data: pixels } = await sample.clone().raw().toBuffer({ resolveWithObject: true });
    const edgeStats = await sample.clone().convolve({
      width: 3,
      height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
    }).stats();
    let brightPixels = 0;
    let darkPixels = 0;
    for (const value of pixels) {
      if (value >= 245) brightPixels += 1;
      if (value <= 20) darkPixels += 1;
    }
    return {
      sourceType,
      mediaKind: "image",
      byteSize: bytes.byteLength,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      pageCount: metadata.pages ?? 1,
      sharpness: edgeStats.channels[0]?.stdev ?? null,
      brightness: stats.channels[0]?.mean ?? null,
      contrast: stats.channels[0]?.stdev ?? null,
      brightPixelRatio: pixels.length ? brightPixels / pixels.length : null,
      darkPixelRatio: pixels.length ? darkPixels / pixels.length : null,
      analysisError: null,
    };
  } catch {
    return { ...base, analysisError: "decode_failed" };
  }
}

export function validateReceiptReadability(
  args: Record<string, unknown>,
  attachment: ReceiptAttachmentQuality | undefined,
): { ok: true } | ReceiptValidationFailure {
  const quality = objectValue(args.quality);
  const issues: string[] = [];
  if (!quality || quality.readable !== true) issues.push("model_marked_unreadable");

  const evidence = new Map(
    arrayObjects(quality?.criticalFields).map((entry) => [String(entry.field ?? ""), entry]),
  );
  for (const field of criticalFields) {
    const entry = evidence.get(field);
    const confidence = String(entry?.confidence ?? "unreadable");
    const excerpt = String(entry?.evidence ?? "").trim();
    if (confidence === "absent" && mayBeAbsent.has(field)) continue;
    if (!new Set(["high", "medium"]).has(confidence) || !excerpt) {
      issues.push(`critical_${field}_unreadable`);
    }
  }

  if (attachment?.analysisError) issues.push("technical_image_decode_failed");
  if (attachment?.mediaKind === "image" && (attachment.pageCount ?? 1) > 1) {
    issues.push("technical_image_page_limit_exceeded");
  }
  if (attachment?.mediaKind === "pdf" && (attachment.pageCount ?? 0) > 30) {
    issues.push("technical_pdf_page_limit_exceeded");
  }
  if (attachment?.width && attachment.height) {
    const shortEdge = Math.min(attachment.width, attachment.height);
    const compressedSmallText = shortEdge < 900 && attachment.byteSize < 180_000;
    const blurredLowContrast = attachment.sharpness !== null && attachment.contrast !== null &&
      attachment.sharpness < 5 && attachment.contrast < 28;
    const badlyExposed = (attachment.brightness !== null && attachment.brightness < 45) ||
      (attachment.brightPixelRatio !== null && attachment.brightPixelRatio > 0.42) ||
      (attachment.darkPixelRatio !== null && attachment.darkPixelRatio > 0.42);
    if ([compressedSmallText, blurredLowContrast, badlyExposed].filter(Boolean).length >= 2) {
      issues.push("technical_image_quality_low");
    }
  }

  return issues.length ? { ok: false, reason: "receipt_quality_rejected", issues } : { ok: true };
}

export function validateReceiptArithmetic(args: Record<string, unknown>): { ok: true } | ReceiptValidationFailure {
  const issues: string[] = [];
  const lineItems = arrayObjects(args.lineItems);
  const periodCharge = moneyToMinor(args.periodChargeAmount);
  if (lineItems.length && periodCharge !== null) {
    const totals = lineItems.map((line) => moneyToMinor(line.totalAmount ?? line.chargeAmount));
    if (totals.every((value): value is bigint => value !== null)) {
      const lineSum = totals.reduce((sum, value) => sum + value, BigInt(0));
      if (differenceTooLarge(lineSum, periodCharge)) issues.push("line_items_do_not_match_period_charge");
    }
  }

  for (const [index, line] of lineItems.entries()) {
    if (line.calculationMode !== "simple") continue;
    const expected = roundedProductMinor(line.volume, line.tariff);
    const actual = moneyToMinor(line.chargeAmount);
    if (expected !== null && actual !== null && differenceTooLarge(expected, actual)) {
      issues.push(`line_${index + 1}_volume_tariff_mismatch`);
    }
  }

  const mandatoryDue = moneyToMinor(args.mandatoryDueAmount ?? args.printedDueAmount);
  if (periodCharge !== null && mandatoryDue !== null) {
    const baseDue = periodCharge +
      (moneyToMinor(args.openingDebtAmount) ?? BigInt(0)) -
      (moneyToMinor(args.openingCreditAmount) ?? BigInt(0)) -
      (moneyToMinor(args.paidAmount) ?? BigInt(0));
    const fullyAdjusted = baseDue +
      (moneyToMinor(args.recalculationAmount) ?? BigInt(0)) -
      (moneyToMinor(args.benefitAmount) ?? BigInt(0)) +
      (moneyToMinor(args.penaltyAmount) ?? BigInt(0));
    if (differenceTooLarge(mandatoryDue, baseDue) && differenceTooLarge(mandatoryDue, fullyAdjusted)) {
      issues.push("top_level_amounts_do_not_reconcile");
    }

    const excludedOptional = arrayObjects(args.optionalCharges)
      .filter((charge) => charge.includedInMandatory === false)
      .map((charge) => moneyToMinor(charge.amount))
      .filter((value): value is bigint => value !== null)
      .reduce((sum, value) => sum + value, BigInt(0));
    if (excludedOptional > BigInt(0) &&
      (mandatoryDue === baseDue + excludedOptional || mandatoryDue === fullyAdjusted + excludedOptional)) {
      issues.push("optional_charge_included_in_mandatory_due");
    }
  }

  return issues.length ? { ok: false, reason: "receipt_arithmetic_invalid", issues } : { ok: true };
}
