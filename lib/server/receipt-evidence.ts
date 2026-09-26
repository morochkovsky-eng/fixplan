import { moneyToMinor } from "@/lib/server/receipt-money";
import type { NormalizedReceipt, ReceiptField } from "@/lib/server/receipt-normalization";
import type { ReceiptEvidenceRegion, ReceiptTranscription } from "@/lib/server/receipt-transcription";

export type ReceiptEvidenceVerification = {
  receipt: NormalizedReceipt;
  warnings: string[];
  rejectedEntities: string[];
};

function normalizedText(value: unknown) {
  return String(value ?? "").toLocaleLowerCase("ru").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, "");
}

function evidenceText(region: ReceiptEvidenceRegion) {
  return [region.label, region.value, region.rawText].filter(Boolean).join(" ");
}

function numericCandidates(value: string) {
  return value.match(/[+-]?\d[\d\s]*(?:[,.]\d+)?/gu) ?? [];
}

function hasNumericEvidence(expectedMinor: number, regions: ReceiptEvidenceRegion[]) {
  return regions.some((region) => numericCandidates(evidenceText(region)).some((candidate) => moneyToMinor(candidate) === BigInt(expectedMinor)));
}

function hasDateEvidence(expected: string, regions: ReceiptEvidenceRegion[]) {
  const digits = expected.replace(/\D/gu, "");
  const reverse = expected.split("-").reverse().join("").replace(/\D/gu, "");
  const [year, month] = expected.split("-");
  const monthNames: Record<string, string[]> = {
    "01": ["январ"], "02": ["феврал"], "03": ["март"], "04": ["апрел"], "05": ["ма"], "06": ["июн"],
    "07": ["июл"], "08": ["август"], "09": ["сентябр"], "10": ["октябр"], "11": ["ноябр"], "12": ["декабр"],
  };
  return regions.some((region) => {
    const text = evidenceText(region).toLocaleLowerCase("ru").replace(/ё/gu, "е");
    const raw = text.replace(/\D/gu, "");
    return raw.includes(digits) || raw.includes(reverse) || (expected.length === 7 && text.includes(year) && (monthNames[month] ?? []).some((name) => text.includes(name)));
  });
}

function hasLiteralEvidence(field: ReceiptField<unknown>, regions: ReceiptEvidenceRegion[]) {
  if (field.value === null) return field.status !== "confirmed";
  if (!field.rawText?.trim()) return false;
  const literal = normalizedText(field.rawText);
  if (!literal || !regions.some((region) => normalizedText(evidenceText(region)).includes(literal))) return false;
  if (typeof field.value === "number") return hasNumericEvidence(field.value, regions);
  if (typeof field.value === "string" && /^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/u.test(field.value)) {
    return hasDateEvidence(field.value, regions);
  }
  if (typeof field.value === "string" && /^[+-]?\d[\d\s]*(?:[,.]\d+)?$/u.test(field.value)) {
    const expected = Number(field.value.replace(/\s+/gu, "").replace(",", "."));
    return regions.some((region) => numericCandidates(evidenceText(region)).some((candidate) => Number(candidate.replace(/\s+/gu, "").replace(",", ".")) === expected));
  }
  return true;
}

function rejectedField<T>(field: ReceiptField<T>, reason: string): ReceiptField<T> {
  if (field.value === null && field.status !== "confirmed") return field;
  return { ...field, status: "needs_review", reason };
}

function regionSet(field: ReceiptField<unknown>, evidence: Map<string, ReceiptEvidenceRegion>) {
  return field.sourceRegionIds.map((id) => evidence.get(id)).filter((region): region is ReceiptEvidenceRegion => Boolean(region));
}

function verifyField<T>(field: ReceiptField<T>, evidence: Map<string, ReceiptEvidenceRegion>, allowedSections?: Set<ReceiptEvidenceRegion["sectionType"]>) {
  if (field.value === null && field.status !== "confirmed") return field;
  if (!field.sourceRegionIds.length) return rejectedField(field, "evidence_region_missing");
  const regions = regionSet(field, evidence);
  if (regions.length !== field.sourceRegionIds.length) return rejectedField(field, "evidence_region_unknown");
  if (allowedSections && regions.some((region) => !allowedSections.has(region.sectionType))) return rejectedField(field, "evidence_wrong_section");
  if (!hasLiteralEvidence(field as ReceiptField<unknown>, regions)) return rejectedField(field, "literal_evidence_missing");
  return field;
}

function entityRegions(fields: ReceiptField<unknown>[], evidence: Map<string, ReceiptEvidenceRegion>) {
  return [...new Set(fields.flatMap((field) => field.sourceRegionIds))].map((id) => evidence.get(id)).filter((item): item is ReceiptEvidenceRegion => Boolean(item));
}

function invalidEntityRegions(regions: ReceiptEvidenceRegion[], section: ReceiptEvidenceRegion["sectionType"], forbiddenKinds: Set<ReceiptEvidenceRegion["kind"]>) {
  return !regions.length || regions.some((region) => region.sectionType !== section || forbiddenKinds.has(region.kind));
}

export function verifyReceiptEvidence(input: NormalizedReceipt, transcription: ReceiptTranscription): ReceiptEvidenceVerification {
  const receipt = structuredClone(input);
  const warnings: string[] = [];
  const rejectedEntities: string[] = [];
  if (!transcription.evidence?.length) {
    const reject = <T>(field: ReceiptField<T>) => field.value === null ? field : rejectedField(field, "evidence_graph_unavailable");
    for (const key of ["isUtilityDocument", "documentType", "provider", "referenceAddress", "accountNumber", "billingPeriod", "issuedDate", "dueDate", "accruedAmount", "openingDebt", "openingAdvance", "paymentsAppliedToCurrentPeriod", "recalculationAmount", "benefitAmount", "penaltyAmount", "printedMandatoryDue", "mandatoryDue"] as const) {
      receipt[key] = reject(receipt[key] as never) as never;
    }
    receipt.lastPayment.amount = reject(receipt.lastPayment.amount);
    receipt.lastPayment.date = reject(receipt.lastPayment.date);
    receipt.lineItems = [];
    receipt.meterEntries = [];
    receipt.optionalCharges = [];
    receipt.financialComponents = [];
    receipt.warnings = [...new Set([...receipt.warnings, "evidence_graph_unavailable"])];
    return { receipt, warnings: ["evidence_graph_unavailable"], rejectedEntities: ["all_confirmed_entities"] };
  }
  const validGeometry = (region: ReceiptEvidenceRegion) => region.page >= 1 && region.bbox.width > 0 && region.bbox.height > 0 && region.bbox.x + region.bbox.width <= 1.000001 && region.bbox.y + region.bbox.height <= 1.000001;
  const evidence = new Map(transcription.evidence.filter(validGeometry).map((region) => [region.id, region]));
  if (evidence.size !== transcription.evidence.length) warnings.push("evidence_invalid_geometry");
  const financial = new Set<ReceiptEvidenceRegion["sectionType"]>(["financial_summary", "service_table"]);
  const identity = new Set<ReceiptEvidenceRegion["sectionType"]>(["identity", "billing_period", "financial_summary", "reference"]);
  for (const key of ["isUtilityDocument", "documentType", "provider", "referenceAddress", "accountNumber", "billingPeriod", "issuedDate", "dueDate"] as const) {
    receipt[key] = verifyField(receipt[key] as never, evidence, identity) as never;
  }
  for (const key of ["accruedAmount", "openingDebt", "openingAdvance", "paymentsAppliedToCurrentPeriod", "recalculationAmount", "benefitAmount", "penaltyAmount", "printedMandatoryDue", "mandatoryDue"] as const) {
    receipt[key] = verifyField(receipt[key], evidence, financial);
  }
  receipt.lastPayment.amount = verifyField(receipt.lastPayment.amount, evidence, new Set(["financial_summary", "reference"]));
  receipt.lastPayment.date = verifyField(receipt.lastPayment.date, evidence, new Set(["financial_summary", "reference"]));

  const owners = new Map<string, string>();
  const acceptsEntity = (entityKey: string, regions: ReceiptEvidenceRegion[]) => {
    for (const region of regions) {
      const owner = owners.get(region.id);
      if (owner && owner !== entityKey && !region.allowsMultipleEntities) return false;
    }
    for (const region of regions) owners.set(region.id, entityKey);
    return true;
  };

  receipt.lineItems = receipt.lineItems.filter((line) => {
    const fields = [line.name, line.unit, line.volume, line.tariff, line.chargeAmount, line.recalculationAmount, line.benefitAmount, line.totalAmount];
    const regions = entityRegions(fields, evidence);
    const invalid = invalidEntityRegions(regions, "service_table", new Set(["heading", "table_header", "total"]));
    const invalidField = fields.some((field) => field.value !== null && verifyField(field as ReceiptField<unknown>, evidence, new Set(["service_table"])).status !== "confirmed");
    if (invalid || invalidField || !acceptsEntity(`line:${line.id}`, regions)) {
      warnings.push(`evidence_line_rejected:${line.id}`);
      rejectedEntities.push(`line:${line.id}`);
      return false;
    }
    return true;
  });
  receipt.meterEntries = receipt.meterEntries.filter((meter) => {
    const fields = [meter.resource, meter.meterNumber, meter.previousValue, meter.currentValue, meter.consumption, meter.unit, meter.tariff];
    const regions = entityRegions(fields, evidence);
    const invalid = invalidEntityRegions(regions, "meter_table", new Set(["heading", "table_header", "reference"]));
    const invalidField = fields.some((field) => field.value !== null && verifyField(field, evidence, new Set(["meter_table"])).status !== "confirmed");
    if (invalid || invalidField || !acceptsEntity(`meter:${meter.id}`, regions)) {
      warnings.push(`evidence_meter_rejected:${meter.id}`);
      rejectedEntities.push(`meter:${meter.id}`);
      return false;
    }
    return true;
  });
  receipt.optionalCharges = receipt.optionalCharges.filter((charge) => {
    const fields = [charge.label, charge.kind, charge.amount, charge.includedInMandatory];
    const regions = entityRegions(fields, evidence);
    const invalidField = fields.some((field) => field.value !== null && verifyField(field as ReceiptField<unknown>, evidence, new Set(["optional_charges"])).status !== "confirmed");
    if (invalidEntityRegions(regions, "optional_charges", new Set(["heading", "table_header"])) || invalidField || !acceptsEntity(`optional:${charge.id}`, regions)) {
      warnings.push(`evidence_optional_rejected:${charge.id}`);
      rejectedEntities.push(`optional:${charge.id}`);
      return false;
    }
    return true;
  });
  receipt.financialComponents = receipt.financialComponents.filter((component) => {
    const fields = [component.label, component.signedAmount, component.affectsMandatoryDue];
    const regions = entityRegions(fields, evidence);
    if (!regions.length || regions.some((region) => !financial.has(region.sectionType)) || fields.some((field) => field.value !== null && verifyField(field as ReceiptField<unknown>, evidence, financial).status !== "confirmed")) {
      warnings.push(`evidence_financial_component_rejected:${component.id}`);
      rejectedEntities.push(`financial:${component.id}`);
      return false;
    }
    return true;
  });
  receipt.warnings = [...new Set([...receipt.warnings, ...warnings])];
  return { receipt, warnings, rejectedEntities };
}
