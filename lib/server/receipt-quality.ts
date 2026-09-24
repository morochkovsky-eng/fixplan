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
  textRegionSharpness: number | null;
  textRegionContrast: number | null;
  contentCoverage: number | null;
  autoOrientationApplied: boolean;
  analysisError: "decode_failed" | null;
};

export type ReceiptValidationFailure = {
  ok: false;
  reason: "receipt_quality_rejected" | "receipt_arithmetic_invalid";
  issues: string[];
  warnings?: string[];
  retryable?: boolean;
};

export type ReceiptRecognitionImages = {
  primaryDataUrl: string;
  targetedDataUrls: string[];
};

const maximumImagePixels = 40_000_000;

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

function pixelStats(pixels: Uint8Array) {
  if (!pixels.length) return { brightness: null, contrast: null, brightPixelRatio: null, darkPixelRatio: null };
  let sum = 0;
  let squared = 0;
  let bright = 0;
  let dark = 0;
  for (const value of pixels) {
    sum += value;
    squared += value * value;
    if (value >= 245) bright += 1;
    if (value <= 20) dark += 1;
  }
  const brightness = sum / pixels.length;
  return {
    brightness,
    contrast: Math.sqrt(Math.max(0, squared / pixels.length - brightness * brightness)),
    brightPixelRatio: bright / pixels.length,
    darkPixelRatio: dark / pixels.length,
  };
}

function edgeSharpness(pixels: Uint8Array, width: number, height: number) {
  if (width < 2 || height < 2) return null;
  let difference = 0;
  let comparisons = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x + 1 < width) {
        difference += Math.abs(pixels[index] - pixels[index + 1]);
        comparisons += 1;
      }
      if (y + 1 < height) {
        difference += Math.abs(pixels[index] - pixels[index + width]);
        comparisons += 1;
      }
    }
  }
  return comparisons ? difference / comparisons : null;
}

function contentRegion(pixels: Uint8Array, width: number, height: number) {
  const activeRows: number[] = [];
  const activeColumns: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let ink = 0;
    for (let x = 0; x < width; x += 1) if (pixels[y * width + x] < 220) ink += 1;
    if (ink / width >= 0.012) activeRows.push(y);
  }
  for (let x = 0; x < width; x += 1) {
    let ink = 0;
    for (let y = 0; y < height; y += 1) if (pixels[y * width + x] < 220) ink += 1;
    if (ink / height >= 0.008) activeColumns.push(x);
  }
  if (!activeRows.length || !activeColumns.length) return null;
  const paddingX = Math.max(2, Math.round(width * 0.02));
  const paddingY = Math.max(2, Math.round(height * 0.02));
  const left = Math.max(0, activeColumns[0] - paddingX);
  const right = Math.min(width - 1, activeColumns.at(-1)! + paddingX);
  const top = Math.max(0, activeRows[0] - paddingY);
  const bottom = Math.min(height - 1, activeRows.at(-1)! + paddingY);
  const regionWidth = right - left + 1;
  const regionHeight = bottom - top + 1;
  const region = new Uint8Array(regionWidth * regionHeight);
  for (let y = 0; y < regionHeight; y += 1) {
    region.set(pixels.subarray((top + y) * width + left, (top + y) * width + right + 1), y * regionWidth);
  }
  return {
    pixels: region,
    width: regionWidth,
    height: regionHeight,
    coverage: (regionWidth * regionHeight) / (width * height),
  };
}

function orientedDimensions(width: number | undefined, height: number | undefined, orientation: number | undefined) {
  const swapsAxes = orientation !== undefined && orientation >= 5 && orientation <= 8;
  return swapsAxes ? { width: height, height: width } : { width, height };
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
    textRegionSharpness: null,
    textRegionContrast: null,
    contentCoverage: null,
    autoOrientationApplied: false,
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
    const source = sharp(bytes, {
      failOn: "none",
      limitInputPixels: maximumImagePixels,
      pages: 1,
      sequentialRead: true,
    });
    const sourceMetadata = await source.metadata();
    const image = source.rotate();
    const metadata = await image.metadata();
    const dimensions = orientedDimensions(metadata.width, metadata.height, sourceMetadata.orientation);
    const sample = image.clone().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).greyscale();
    const { data: pixels, info } = await sample.clone().raw().toBuffer({ resolveWithObject: true });
    const globalStats = pixelStats(pixels);
    const region = contentRegion(pixels, info.width, info.height);
    const regionStats = region ? pixelStats(region.pixels) : null;
    return {
      sourceType,
      mediaKind: "image",
      byteSize: bytes.byteLength,
      width: dimensions.width ?? null,
      height: dimensions.height ?? null,
      pageCount: metadata.pages ?? 1,
      sharpness: edgeSharpness(pixels, info.width, info.height),
      brightness: globalStats.brightness,
      contrast: globalStats.contrast,
      brightPixelRatio: globalStats.brightPixelRatio,
      darkPixelRatio: globalStats.darkPixelRatio,
      textRegionSharpness: region ? edgeSharpness(region.pixels, region.width, region.height) : null,
      textRegionContrast: regionStats?.contrast ?? null,
      contentCoverage: region?.coverage ?? null,
      autoOrientationApplied: Boolean(sourceMetadata.orientation && sourceMetadata.orientation !== 1),
      analysisError: null,
    };
  } catch {
    return { ...base, analysisError: "decode_failed" };
  }
}

export async function prepareReceiptRecognitionImages(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ReceiptRecognitionImages | null> {
  if (!mimeType.startsWith("image/")) return null;
  try {
    const { default: sharp } = await import("sharp");
    const options = { failOn: "none" as const, limitInputPixels: maximumImagePixels, pages: 1, sequentialRead: true };
    const metadata = await sharp(bytes, options).metadata();
    const dimensions = orientedDimensions(metadata.width, metadata.height, metadata.orientation);
    const width = dimensions.width ?? 0;
    const height = dimensions.height ?? 0;
    if (!width || !height) return null;
    const source = sharp(bytes, options).rotate();
    const scale = Math.min(1.45, 2048 / width, 2600 / height);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const enhance = (image: ReturnType<typeof sharp>) => image
      .resize({ width: targetWidth, height: targetHeight, fit: "inside", kernel: "lanczos3" })
      .normalise({ lower: 1, upper: 99 })
      .sharpen({ sigma: 0.65 })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" });
    const primary = await enhance(source.clone()).toBuffer();
    const crops = [
      { top: 0, height: Math.max(1, Math.round(height * 0.42)) },
      { top: Math.round(height * 0.29), height: Math.max(1, Math.round(height * 0.42)) },
      { top: Math.round(height * 0.58), height: Math.max(1, Math.round(height * 0.42)) },
    ].map(({ top, height: cropHeight }) => ({
      top: Math.min(top, height - 1),
      height: Math.min(cropHeight, height - Math.min(top, height - 1)),
    }));
    const targeted: Buffer[] = [];
    for (const crop of crops) {
      targeted.push(await enhance(source.clone().extract({ left: 0, width, ...crop })).toBuffer());
    }
    const asDataUrl = (buffer: Buffer) => `data:image/jpeg;base64,${buffer.toString("base64")}`;
    return { primaryDataUrl: asDataUrl(primary), targetedDataUrls: targeted.map(asDataUrl) };
  } catch {
    return null;
  }
}

function technicalQuality(attachment: ReceiptAttachmentQuality | undefined) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!attachment) return { blockers, warnings };
  if (attachment.analysisError) blockers.push("technical_image_decode_failed");
  if (attachment.mediaKind === "image" && (attachment.pageCount ?? 1) > 1) blockers.push("technical_image_page_limit_exceeded");
  if (attachment.mediaKind === "pdf" && (attachment.pageCount ?? 0) > 30) blockers.push("technical_pdf_page_limit_exceeded");
  if (attachment.mediaKind !== "image" || !attachment.width || !attachment.height) return { blockers, warnings };
  const shortEdge = Math.min(attachment.width, attachment.height);
  const regionSharpness = attachment.textRegionSharpness ?? attachment.sharpness;
  const regionContrast = attachment.textRegionContrast ?? attachment.contrast;
  if (shortEdge < 320) blockers.push("technical_image_critically_small");
  const almostUniform = (attachment.brightPixelRatio ?? 0) > 0.995 || (attachment.darkPixelRatio ?? 0) > 0.985;
  if (almostUniform && (attachment.contentCoverage === null || attachment.contentCoverage < 0.01)) {
    blockers.push("technical_image_content_missing");
  }
  if (regionSharpness !== null && regionContrast !== null && regionSharpness < 1.2 && regionContrast < 10) {
    blockers.push("technical_image_detail_destroyed");
  }
  if (shortEdge < 900 && attachment.byteSize < 180_000) warnings.push("technical_image_compressed_small_text");
  if (regionSharpness !== null && regionContrast !== null && regionSharpness < 5 && regionContrast < 28) {
    warnings.push("technical_image_blur_or_low_contrast");
  }
  if ((attachment.brightness ?? 128) < 45 || (attachment.brightPixelRatio ?? 0) > 0.42 || (attachment.darkPixelRatio ?? 0) > 0.42) {
    warnings.push("technical_image_exposure_warning");
  }
  return { blockers, warnings };
}

export function validateReceiptReadability(
  args: Record<string, unknown>,
  attachment: ReceiptAttachmentQuality | undefined,
): { ok: true } | ReceiptValidationFailure {
  const quality = objectValue(args.quality);
  const issues: string[] = [];
  const { blockers, warnings } = technicalQuality(attachment);

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
  if (quality?.readable !== true && issues.length) issues.unshift("model_marked_unreadable");
  const allIssues = [...blockers, ...issues];
  return allIssues.length
    ? { ok: false, reason: "receipt_quality_rejected", issues: allIssues, warnings, retryable: blockers.length === 0 }
    : { ok: true };
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
