import type { ReceiptTranscription } from "@/lib/server/receipt-transcription";

export type ReviewStatus = "confirmed" | "needs_review" | "missing";

export type ReceiptField<T> = {
  value: T | null;
  rawText: string | null;
  sourceRegionIds: string[];
  status: ReviewStatus;
  reason: string | null;
};

export type NormalizedReceiptLine = {
  id: string;
  rowKind: "charge" | "subtotal" | "grand_total" | "reference";
  name: ReceiptField<string>;
  unit: ReceiptField<string>;
  volume: ReceiptField<string>;
  tariff: ReceiptField<string>;
  chargeAmount: ReceiptField<number>;
  recalculationAmount: ReceiptField<number>;
  benefitAmount: ReceiptField<number>;
  totalAmount: ReceiptField<number>;
  calculationMode: "simple" | "zoned" | "tiered" | "composite" | "printed_total";
};

export type ReceiptFinancialComponent = {
  id: string;
  role: "accrued" | "opening_debt" | "opening_advance" | "current_payment" | "last_payment" | "recalculation" | "benefit" | "penalty" | "printed_due" | "other";
  label: ReceiptField<string>;
  signedAmount: ReceiptField<number>;
  affectsMandatoryDue: ReceiptField<boolean>;
};

export type NormalizedReceipt = {
  isUtilityDocument: ReceiptField<boolean>;
  documentType: ReceiptField<string>;
  provider: ReceiptField<string>;
  referenceAddress: ReceiptField<string>;
  accountNumber: ReceiptField<string>;
  billingPeriod: ReceiptField<string>;
  issuedDate: ReceiptField<string>;
  dueDate: ReceiptField<string>;
  accruedAmount: ReceiptField<number>;
  openingDebt: ReceiptField<number>;
  openingAdvance: ReceiptField<number>;
  paymentsAppliedToCurrentPeriod: ReceiptField<number>;
  recalculationAmount: ReceiptField<number>;
  benefitAmount: ReceiptField<number>;
  penaltyAmount: ReceiptField<number>;
  printedMandatoryDue: ReceiptField<number>;
  mandatoryDue: ReceiptField<number>;
  lastPayment: { amount: ReceiptField<number>; date: ReceiptField<string> };
  financialComponents: ReceiptFinancialComponent[];
  lineItems: NormalizedReceiptLine[];
  meterEntries: Array<{
    id: string;
    resource: ReceiptField<string>;
    meterNumber: ReceiptField<string>;
    previousValue: ReceiptField<string>;
    currentValue: ReceiptField<string>;
    consumption: ReceiptField<string>;
    unit: ReceiptField<string>;
    tariff: ReceiptField<string>;
  }>;
  optionalCharges: Array<{
    id: string;
    label: ReceiptField<string>;
    kind: ReceiptField<string>;
    amount: ReceiptField<number>;
    includedInMandatory: ReceiptField<boolean>;
  }>;
  warnings: string[];
};

const status = { type: "string", enum: ["confirmed", "needs_review", "missing"] };
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableBillingPeriod = { anyOf: [{ type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" }, { type: "null" }] };
const nullableIsoDate = { anyOf: [{ type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])-([0-2]\\d|3[01])$" }, { type: "null" }] };
const nullableInteger = { anyOf: [{ type: "integer" }, { type: "null" }] };
const nullableBoolean = { anyOf: [{ type: "boolean" }, { type: "null" }] };
const field = (value: unknown) => ({ type: "object", additionalProperties: false, required: ["value", "rawText", "sourceRegionIds", "status", "reason"], properties: { value, rawText: nullableString, sourceRegionIds: { type: "array", items: { type: "string" } }, status, reason: nullableString } });
const textField = field(nullableString);
const billingPeriodField = field(nullableBillingPeriod);
const dateField = field(nullableIsoDate);
const moneyField = field(nullableInteger);
const boolField = field(nullableBoolean);
const documentKindField = field({ anyOf: [{ type: "string", enum: ["housing", "electricity", "water", "capital_repair", "other"] }, { type: "null" }] });

const lineSchema = {
  type: "object", additionalProperties: false,
  required: ["id", "rowKind", "name", "unit", "volume", "tariff", "chargeAmount", "recalculationAmount", "benefitAmount", "totalAmount", "calculationMode"],
  properties: { id: { type: "string" }, rowKind: { type: "string", enum: ["charge", "subtotal", "grand_total", "reference"] }, name: textField, unit: textField, volume: textField, tariff: textField, chargeAmount: moneyField, recalculationAmount: moneyField, benefitAmount: moneyField, totalAmount: moneyField, calculationMode: { type: "string", enum: ["simple", "zoned", "tiered", "composite", "printed_total"] } },
};

const financialComponentSchema = {
  type: "object", additionalProperties: false,
  required: ["id", "role", "label", "signedAmount", "affectsMandatoryDue"],
  properties: {
    id: { type: "string" },
    role: { type: "string", enum: ["accrued", "opening_debt", "opening_advance", "current_payment", "last_payment", "recalculation", "benefit", "penalty", "printed_due", "other"] },
    label: textField,
    signedAmount: moneyField,
    affectsMandatoryDue: boolField,
  },
};

export const receiptNormalizationSchema = {
  type: "object", additionalProperties: false,
  required: ["isUtilityDocument", "documentType", "provider", "referenceAddress", "accountNumber", "billingPeriod", "issuedDate", "dueDate", "accruedAmount", "openingDebt", "openingAdvance", "paymentsAppliedToCurrentPeriod", "recalculationAmount", "benefitAmount", "penaltyAmount", "printedMandatoryDue", "mandatoryDue", "lastPayment", "financialComponents", "lineItems", "meterEntries", "optionalCharges", "warnings"],
  properties: {
    isUtilityDocument: boolField, documentType: documentKindField, provider: textField, referenceAddress: textField, accountNumber: textField, billingPeriod: billingPeriodField, issuedDate: dateField, dueDate: dateField,
    accruedAmount: moneyField, openingDebt: moneyField, openingAdvance: moneyField, paymentsAppliedToCurrentPeriod: moneyField, recalculationAmount: moneyField, benefitAmount: moneyField, penaltyAmount: moneyField, printedMandatoryDue: moneyField, mandatoryDue: moneyField,
    lastPayment: { type: "object", additionalProperties: false, required: ["amount", "date"], properties: { amount: moneyField, date: dateField } },
    financialComponents: { type: "array", items: financialComponentSchema },
    lineItems: { type: "array", items: lineSchema },
    meterEntries: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "resource", "meterNumber", "previousValue", "currentValue", "consumption", "unit", "tariff"], properties: { id: { type: "string" }, resource: textField, meterNumber: textField, previousValue: textField, currentValue: textField, consumption: textField, unit: textField, tariff: textField } } },
    optionalCharges: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "kind", "amount", "includedInMandatory"], properties: { id: { type: "string" }, label: textField, kind: textField, amount: moneyField, includedInMandatory: boolField } } },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

export const receiptNormalizationPrompt = `Normalize the supplied literal transcription into the receipt schema. Use only literal text and evidence IDs present in transcription.evidence. Every non-null field must retain its literal rawText and one or more sourceRegionIds. Monetary values are signed integer minor units (kopecks), never floating point. Normalize billingPeriod to YYYY-MM and every date to YYYY-MM-DD while preserving the literal printed form in rawText. Return null/missing rather than a non-canonical or guessed date. Do not infer missing numbers from templates or arithmetic. Never create a number absent from every cited evidence region.

Preserve every printed financial component in financialComponents with its semantic role, literal label, signed amount, affectsMandatoryDue and evidence IDs. The sign and affectsMandatoryDue must follow the printed document; when either is ambiguous, mark it needs_review rather than changing a sign to make arithmetic work. Separate current accrual, opening debt, opening advance, payments explicitly applied to this period, recalculation, benefit, penalty, printed mandatory due and normalized mandatory due. A historical last payment amount/date is reference-only and must never become paymentsAppliedToCurrentPeriod unless the document explicitly says it was applied to this calculation. Preserve debt and advance as non-negative magnitudes in their canonical fields while retaining the signed printed component. Optional or voluntary services must be separate and excluded unless the printed mandatory total explicitly includes them.

Only evidence with sectionType=service_table and a visual charge row can become rowKind=charge. Section headings are not charges; subtotals and grand totals retain their row kinds and are not duplicated as charges. Meter entries require meter_table evidence; normatives and reference values are not readings. Use calculationMode=simple only for one visibly printed volume × tariff formula; zoned, tiered and composite calculations must not be reduced to a simple formula. Blank current meter readings remain null/missing. A plausible value without direct evidence is missing, never confirmed.`;

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeReceiptField<T>(first: ReceiptField<T>, fallback: ReceiptField<T>): ReceiptField<T> {
  if (first.status === "confirmed") {
    if (fallback.status === "confirmed" && !sameValue(first.value, fallback.value)) {
      return { ...first, status: "needs_review", reason: "fallback_conflict", sourceRegionIds: [...new Set([...first.sourceRegionIds, ...fallback.sourceRegionIds])] };
    }
    return first;
  }
  if (fallback.status === "confirmed" && fallback.sourceRegionIds.length && fallback.rawText) return fallback;
  return first.status === "missing" && fallback.status === "needs_review" ? fallback : first;
}

export function mergeNormalizedReceipts(first: NormalizedReceipt, fallback: NormalizedReceipt): NormalizedReceipt {
  const scalarKeys = ["isUtilityDocument", "documentType", "provider", "referenceAddress", "accountNumber", "billingPeriod", "issuedDate", "dueDate", "accruedAmount", "openingDebt", "openingAdvance", "paymentsAppliedToCurrentPeriod", "recalculationAmount", "benefitAmount", "penaltyAmount", "printedMandatoryDue", "mandatoryDue"] as const;
  const merged = { ...first } as NormalizedReceipt;
  for (const key of scalarKeys) (merged[key] as ReceiptField<unknown>) = mergeReceiptField(first[key] as ReceiptField<unknown>, fallback[key] as ReceiptField<unknown>);
  merged.lastPayment = { amount: mergeReceiptField(first.lastPayment.amount, fallback.lastPayment.amount), date: mergeReceiptField(first.lastPayment.date, fallback.lastPayment.date) };
  const mergeById = <T extends { id: string }>(original: T[], additions: T[]) => {
    const values = new Map(original.map((item) => [item.id, item]));
    for (const item of additions) if (!values.has(item.id)) values.set(item.id, item);
    return [...values.values()];
  };
  merged.lineItems = mergeById(first.lineItems, fallback.lineItems);
  merged.meterEntries = mergeById(first.meterEntries, fallback.meterEntries);
  merged.optionalCharges = mergeById(first.optionalCharges, fallback.optionalCharges);
  merged.financialComponents = mergeById(first.financialComponents ?? [], fallback.financialComponents ?? []);
  merged.warnings = [...new Set([...first.warnings, ...fallback.warnings])];
  return merged;
}

export function unresolvedReceiptFields(receipt: NormalizedReceipt) {
  const entries: Array<[string, ReceiptField<unknown>]> = [
    ["isUtilityDocument", receipt.isUtilityDocument], ["documentType", receipt.documentType], ["provider", receipt.provider], ["referenceAddress", receipt.referenceAddress], ["accountNumber", receipt.accountNumber], ["billingPeriod", receipt.billingPeriod], ["issuedDate", receipt.issuedDate], ["dueDate", receipt.dueDate], ["accruedAmount", receipt.accruedAmount], ["openingDebt", receipt.openingDebt], ["openingAdvance", receipt.openingAdvance], ["paymentsAppliedToCurrentPeriod", receipt.paymentsAppliedToCurrentPeriod], ["recalculationAmount", receipt.recalculationAmount], ["benefitAmount", receipt.benefitAmount], ["penaltyAmount", receipt.penaltyAmount], ["printedMandatoryDue", receipt.printedMandatoryDue], ["mandatoryDue", receipt.mandatoryDue], ["lastPayment.amount", receipt.lastPayment.amount], ["lastPayment.date", receipt.lastPayment.date],
  ];
  const criticalWhenMissing = new Set(["isUtilityDocument", "billingPeriod", "accruedAmount", "printedMandatoryDue", "mandatoryDue"]);
  return entries
    .filter(([name, value]) => value.status === "needs_review" || (value.status === "missing" && criticalWhenMissing.has(name)))
    .map(([name, value]) => ({ name, sourceRegionIds: value.sourceRegionIds }));
}

export function parseNormalizedReceipt(value: unknown): NormalizedReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = value as NormalizedReceipt;
  if (!(receipt.isUtilityDocument && receipt.billingPeriod && receipt.mandatoryDue && Array.isArray(receipt.lineItems) && Array.isArray(receipt.meterEntries) && Array.isArray(receipt.optionalCharges))) return null;
  receipt.financialComponents = Array.isArray(receipt.financialComponents) ? receipt.financialComponents : [];
  return receipt;
}

export function compactTranscription(transcription: ReceiptTranscription, regionIds: string[]) {
  if (!regionIds.length) return transcription;
  const wanted = new Set(regionIds);
  return { ...transcription, regions: transcription.regions.filter((region) => wanted.has(region.id)), keyValues: transcription.keyValues.filter((item) => wanted.has(item.id)), totals: transcription.totals.filter((item) => wanted.has(item.id)), meters: transcription.meters.filter((item) => wanted.has(item.id)), tables: transcription.tables.filter((table) => wanted.has(table.id) || table.rows.some((row) => wanted.has(row.id))), evidence: transcription.evidence?.filter((item) => wanted.has(item.id)) };
}
