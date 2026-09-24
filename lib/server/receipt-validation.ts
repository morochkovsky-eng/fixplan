import { minorToDecimal } from "@/lib/server/receipt-money";
import type { NormalizedReceipt, NormalizedReceiptLine, ReceiptField } from "@/lib/server/receipt-normalization";

export type ReceiptValidation = {
  ok: boolean;
  blockers: string[];
  reviewFields: string[];
  warnings: string[];
  receipt: NormalizedReceipt;
};

function absolute(value: number) {
  return Math.abs(value);
}

function parseDecimal(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\s+/gu, "").replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/u.test(normalized) ? Number(normalized) : null;
}

function productMinor(volume: string | null, tariff: string | null) {
  const left = parseDecimal(volume);
  const right = parseDecimal(tariff);
  return left === null || right === null ? null : Math.round(left * right * 100);
}

function markLine(line: NormalizedReceiptLine, reason: string): NormalizedReceiptLine {
  const mark = <T>(field: ReceiptField<T>): ReceiptField<T> => field.status === "confirmed" ? { ...field, status: "needs_review", reason } : field;
  return { ...line, chargeAmount: mark(line.chargeAmount), totalAmount: mark(line.totalAmount) };
}

export function validateNormalizedReceipt(input: NormalizedReceipt): ReceiptValidation {
  const receipt = structuredClone(input);
  const warnings = [...receipt.warnings];
  const blockers: string[] = [];
  if (receipt.isUtilityDocument.status !== "confirmed" || receipt.isUtilityDocument.value !== true) blockers.push("utility_document_unconfirmed");
  if (receipt.billingPeriod.status !== "confirmed" || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(receipt.billingPeriod.value ?? "")) blockers.push("billing_period_unconfirmed");
  if (receipt.mandatoryDue.status !== "confirmed" || receipt.mandatoryDue.value === null || receipt.mandatoryDue.value <= 0) blockers.push("mandatory_due_unconfirmed");

  receipt.lineItems = receipt.lineItems.map((line) => {
    if (line.rowKind !== "charge" || line.calculationMode !== "simple") return line;
    const product = productMinor(line.volume.value, line.tariff.value);
    const printed = line.totalAmount.value ?? line.chargeAmount.value;
    if (product !== null && printed !== null && absolute(product - printed) > 2) {
      warnings.push(`line_formula_mismatch:${line.id}`);
      return markLine(line, "simple_formula_mismatch");
    }
    return line;
  });

  const chargeRows = receipt.lineItems.filter((line) => line.rowKind === "charge");
  const completeCharges = chargeRows.length > 0 && chargeRows.every((line) => (line.totalAmount.value ?? line.chargeAmount.value) !== null && (line.totalAmount.status === "confirmed" || line.chargeAmount.status === "confirmed"));
  if (completeCharges && receipt.accruedAmount.status === "confirmed" && receipt.accruedAmount.value !== null) {
    const lineTotal = chargeRows.reduce((sum, line) => sum + (line.totalAmount.value ?? line.chargeAmount.value ?? 0), 0);
    if (absolute(lineTotal - receipt.accruedAmount.value) > 2) warnings.push("charge_rows_do_not_match_accrual");
  } else if (chargeRows.length && receipt.accruedAmount.status === "confirmed") {
    warnings.push("charge_rows_incomplete");
  }

  const balanceFields = [receipt.accruedAmount, receipt.openingDebt, receipt.openingAdvance, receipt.paymentsAppliedToCurrentPeriod, receipt.recalculationAmount, receipt.penaltyAmount];
  if (balanceFields.every((field) => field.status === "confirmed" && field.value !== null) && receipt.mandatoryDue.value !== null) {
    // Some suppliers fold adjustments into the printed accrual while others print an
    // explicit adjusted balance. Accept either visible convention, never manufacture one.
    const base = (receipt.accruedAmount.value ?? 0) + (receipt.openingDebt.value ?? 0) - (receipt.openingAdvance.value ?? 0) - (receipt.paymentsAppliedToCurrentPeriod.value ?? 0);
    const adjusted = base + (receipt.recalculationAmount.value ?? 0) - (receipt.benefitAmount.value ?? 0) + (receipt.penaltyAmount.value ?? 0);
    if (absolute(base - receipt.mandatoryDue.value) > 2 && absolute(adjusted - receipt.mandatoryDue.value) > 2) {
      warnings.push("top_level_balance_conflict");
      receipt.mandatoryDue = { ...receipt.mandatoryDue, status: "needs_review", reason: "top_level_balance_conflict" };
      if (!blockers.includes("mandatory_due_unconfirmed")) blockers.push("mandatory_due_conflict");
    }
  }

  for (const optional of receipt.optionalCharges) {
    if (optional.includedInMandatory.value === true) warnings.push(`optional_charge_included:${optional.id}`);
  }
  const reviewFields = collectReviewFields(receipt);
  return { ok: blockers.length === 0, blockers, reviewFields, warnings: [...new Set(warnings)], receipt };
}

export function collectReviewFields(receipt: NormalizedReceipt) {
  const fields: Array<[string, ReceiptField<unknown>]> = [
    ["documentType", receipt.documentType], ["provider", receipt.provider], ["referenceAddress", receipt.referenceAddress], ["accountNumber", receipt.accountNumber], ["billingPeriod", receipt.billingPeriod], ["issuedDate", receipt.issuedDate], ["dueDate", receipt.dueDate], ["accruedAmount", receipt.accruedAmount], ["openingDebt", receipt.openingDebt], ["openingAdvance", receipt.openingAdvance], ["paymentsAppliedToCurrentPeriod", receipt.paymentsAppliedToCurrentPeriod], ["recalculationAmount", receipt.recalculationAmount], ["benefitAmount", receipt.benefitAmount], ["penaltyAmount", receipt.penaltyAmount], ["printedMandatoryDue", receipt.printedMandatoryDue], ["mandatoryDue", receipt.mandatoryDue], ["lastPayment.amount", receipt.lastPayment.amount], ["lastPayment.date", receipt.lastPayment.date],
  ];
  for (const line of receipt.lineItems) for (const key of ["name", "unit", "volume", "tariff", "chargeAmount", "recalculationAmount", "benefitAmount", "totalAmount"] as const) fields.push([`lineItems.${line.id}.${key}`, line[key]]);
  for (const meter of receipt.meterEntries) for (const key of ["resource", "meterNumber", "previousValue", "currentValue", "consumption", "unit", "tariff"] as const) fields.push([`meterEntries.${meter.id}.${key}`, meter[key]]);
  return fields.filter(([, field]) => field.status !== "confirmed").map(([name]) => name);
}

function decimal(minor: number | null) {
  return minor === null ? "" : minorToDecimal(BigInt(minor));
}

function userWarning(code: string) {
  if (code === "charge_rows_incomplete") return "Не все строки услуг удалось подтвердить.";
  if (code === "charge_rows_do_not_match_accrual") return "Сумма подтверждённых строк услуг отличается от напечатанного начисления.";
  if (code.startsWith("line_formula_mismatch:")) return "Для одной из строк не сходится напечатанный расчёт объём × тариф.";
  if (code.startsWith("optional_charge_included:")) return "Проверьте, входит ли добровольная услуга в обязательный итог.";
  return code;
}

export function receiptToBillPayload(receipt: NormalizedReceipt, validation: ReceiptValidation) {
  const kind = receipt.documentType.value || "other";
  return {
    service: receipt.provider.value || receipt.documentType.value || "Коммунальный платёж",
    documentKind: kind,
    providerName: receipt.provider.value || "",
    documentAddress: receipt.referenceAddress.value || "",
    accountNumber: receipt.accountNumber.value || "",
    periodMonth: receipt.billingPeriod.value || "",
    period: receipt.billingPeriod.value || "",
    documentDate: receipt.issuedDate.value || "",
    dueDate: receipt.dueDate.value || "",
    periodChargeAmount: decimal(receipt.accruedAmount.value),
    openingDebtAmount: decimal(receipt.openingDebt.value),
    openingCreditAmount: decimal(receipt.openingAdvance.value),
    paidAmount: decimal(receipt.paymentsAppliedToCurrentPeriod.value),
    recalculationAmount: decimal(receipt.recalculationAmount.value),
    benefitAmount: decimal(receipt.benefitAmount.value),
    penaltyAmount: decimal(receipt.penaltyAmount.value),
    mandatoryDueAmount: decimal(receipt.mandatoryDue.value),
    printedDueAmount: decimal(receipt.printedMandatoryDue.value),
    lineItems: receipt.lineItems.filter((line) => line.rowKind === "charge").map((line) => ({ name: line.name.value || "Услуга", unit: line.unit.value || "", volume: line.volume.value || "", tariff: line.tariff.value || "", chargeAmount: decimal(line.chargeAmount.value), recalculationAmount: decimal(line.recalculationAmount.value), benefitAmount: decimal(line.benefitAmount.value), totalAmount: decimal(line.totalAmount.value), calculationMode: line.calculationMode })),
    meters: receipt.meterEntries.map((meter) => ({ resource: meter.resource.value || "Ресурс", meterNumber: meter.meterNumber.value || "", previousValue: meter.previousValue.value || "", currentValue: meter.currentValue.value || "", consumption: meter.consumption.value || "", unit: meter.unit.value || "", tariff: meter.tariff.value || "" })),
    optionalCharges: receipt.optionalCharges.filter((charge) => charge.amount.value !== null).map((charge) => ({ label: charge.label.value || "Добровольная услуга", kind: charge.kind.value || "other", amount: decimal(charge.amount.value), includedInMandatory: charge.includedInMandatory.value === true })),
    warnings: validation.warnings.map(userWarning),
    receiptEvidence: receipt,
    reviewFields: validation.reviewFields,
    lastPaymentAmount: decimal(receipt.lastPayment.amount.value),
    lastPaymentDate: receipt.lastPayment.date.value || "",
    note: validation.reviewFields.length ? `Требуют проверки: ${validation.reviewFields.join(", ")}` : "",
    allocation: "tenant",
  };
}
