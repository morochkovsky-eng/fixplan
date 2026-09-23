import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUtilityPeriod } from "@/lib/utility-period";
import { calculatedProviderDue, minorToDecimal, moneyToMinor } from "@/lib/server/receipt-money";

const statuses = new Set(["draft", "due", "paid", "overdue"]);
const allocations = new Set(["owner", "tenant", "split"]);
const reimbursementStatuses = new Set(["not_required", "awaiting", "received"]);
const sources = new Set(["web", "telegram_private", "telegram_group"]);

export type UtilityBillRow = {
  id: string;
  service: string;
  period: string;
  amount: number | string;
  due_date_label: string;
  paid_at_label: string | null;
  status: string;
  receipt_url: string | null;
  receipt_storage_path?: string | null;
  note: string | null;
  allocation: string;
  tenant_amount: number | string;
  optional_charge_label?: string | null;
  optional_charge_amount?: number | string;
  optional_charge_included?: boolean;
  reimbursement_status: string;
  reimbursed_at_label: string | null;
  source: string;
  owner_confirmed_at: string | null;
  published_at: string | null;
  created_at: string;
};

export function normalizeBillPayload(body: Record<string, unknown>) {
  const service = String(body.service ?? "").trim();
  const periodMonth = String(body.periodMonth ?? "").trim();
  const period = normalizeUtilityPeriod(body.period) || (periodMonth ? periodMonth : "Период требует уточнения");
  const status = String(body.status ?? "due");
  const amountMinor = moneyToMinor(body.mandatoryDueAmount ?? body.periodChargeAmount ?? body.amount);
  const amount = amountMinor === null ? Number(body.amount ?? 0) : minorToDecimal(amountMinor);
  const allocation = String(body.allocation ?? "owner");
  const requestedTenantMinor = moneyToMinor(body.tenantAmount);
  const requestedTenantAmount = requestedTenantMinor === null ? Number(body.tenantAmount ?? 0) : minorToDecimal(requestedTenantMinor);
  const hasExplicitTenantAmount = body.tenantAmount !== undefined && body.tenantAmount !== null && String(body.tenantAmount).trim() !== "";
  const tenantAmount = allocation === "owner"
    ? 0
    : allocation === "tenant" && !hasExplicitTenantAmount
      ? amount
      : requestedTenantAmount;
  const requestedReimbursementStatus = String(
    body.reimbursementStatus ?? (Number(tenantAmount) > 0 ? "awaiting" : "not_required"),
  );
  const reimbursementStatus = Number(tenantAmount) > 0 ? requestedReimbursementStatus : "not_required";
  const source = String(body.source ?? "web");

  if (!service) {
    return { error: "Укажите услугу и период." } as const;
  }

  const numericAmount = Number(amount);
  const numericTenantAmount = Number(tenantAmount);

  if (
    !statuses.has(status) ||
    !allocations.has(allocation) ||
    !reimbursementStatuses.has(reimbursementStatus) ||
    !sources.has(source) ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    !Number.isFinite(numericTenantAmount) ||
    numericTenantAmount < 0 ||
    numericTenantAmount > numericAmount
  ) {
    return { error: numericAmount <= 0 ? "Сумма счета должна быть больше нуля." : "Некорректные параметры счета." } as const;
  }

  const calculatedDue = calculatedProviderDue({
    currentCharge: body.periodChargeAmount,
    openingDebt: body.openingDebtAmount,
    openingCredit: body.openingCreditAmount,
    paid: body.paidAmount,
  });
  const printedDue = moneyToMinor(body.printedDueAmount ?? body.mandatoryDueAmount);
  const arithmeticDifference = calculatedDue === null || printedDue === null ? null : printedDue - calculatedDue;
  const warnings = Array.isArray(body.warnings) ? body.warnings.map(String).filter(Boolean) : [];
  if (arithmeticDifference !== null && arithmeticDifference !== BigInt(0)) {
    warnings.push(`Арифметика не сходится на ${minorToDecimal(arithmeticDifference)}.`);
  }

  return {
    bill: {
      service,
      period,
      amount,
      due_date_label: String(body.dueDate ?? "").trim(),
      paid_at_label:
        typeof body.paidAt === "string" && body.paidAt.trim() ? body.paidAt.trim() : null,
      status,
      receipt_url:
        typeof body.receiptUrl === "string" && body.receiptUrl.trim()
          ? body.receiptUrl.trim()
          : null,
      receipt_storage_path:
        typeof body.receiptStoragePath === "string" && body.receiptStoragePath.trim()
          ? body.receiptStoragePath.trim()
          : null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
      allocation,
      tenant_amount: tenantAmount,
      optional_charge_label: String(body.optionalChargeLabel ?? "").trim() || null,
      optional_charge_amount: Math.max(0, Number(body.optionalChargeAmount ?? 0)),
      optional_charge_included: Boolean(body.optionalChargeIncluded),
      reimbursement_status: reimbursementStatus,
      reimbursed_at_label:
        typeof body.reimbursedAt === "string" && body.reimbursedAt.trim()
          ? body.reimbursedAt.trim()
          : null,
      source,
      owner_confirmed_at:
        typeof body.ownerConfirmedAt === "string" && body.ownerConfirmedAt.trim()
          ? body.ownerConfirmedAt.trim()
          : null,
      published_at:
        typeof body.publishedAt === "string" && body.publishedAt.trim()
          ? body.publishedAt.trim()
          : null,
      document_kind: String(body.documentKind ?? "other"),
      provider_name: String(body.providerName ?? "").trim() || null,
      document_address: String(body.documentAddress ?? "").trim() || null,
      account_number: String(body.accountNumber ?? "").trim() || null,
      billing_period_month: /^\d{4}-\d{2}$/u.test(periodMonth) ? `${periodMonth}-01` : null,
      document_date: /^\d{4}-\d{2}-\d{2}$/u.test(String(body.documentDate ?? "")) ? String(body.documentDate) : null,
      due_date: /^\d{4}-\d{2}-\d{2}$/u.test(String(body.dueDate ?? "")) ? String(body.dueDate) : null,
      period_charge_minor: minorValue(body.periodChargeAmount),
      opening_debt_minor: minorValue(body.openingDebtAmount),
      opening_credit_minor: minorValue(body.openingCreditAmount),
      paid_minor: minorValue(body.paidAmount),
      recalculation_minor: minorValue(body.recalculationAmount),
      benefit_minor: minorValue(body.benefitAmount),
      penalty_minor: minorValue(body.penaltyAmount),
      mandatory_due_minor: minorValue(body.mandatoryDueAmount ?? body.periodChargeAmount ?? body.amount),
      printed_due_minor: minorValue(body.printedDueAmount),
      arithmetic_difference_minor: arithmeticDifference?.toString() ?? null,
      currency: String(body.currency ?? "RUB"),
      source_update_id: Number.isSafeInteger(Number(body.sourceUpdateId)) ? Number(body.sourceUpdateId) : null,
      source_fingerprint: /^[a-f0-9]{64}$/u.test(String(body.sourceFingerprint ?? "")) ? String(body.sourceFingerprint) : null,
      extraction_warnings: warnings,
    },
    lineItems: normalizeLineItems(body.lineItems),
    meters: normalizeMeters(body.meters),
    optionalCharges: normalizeOptionalCharges(body.optionalCharges),
  } as const;
}

function minorValue(value: unknown) {
  return moneyToMinor(value)?.toString() ?? null;
}

function decimalValue(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/u.test(normalized) ? normalized : null;
}

function objectItems(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function normalizeLineItems(value: unknown) {
  return objectItems(value).map((item, position) => ({
    position,
    name: String(item.name ?? "").trim() || "Услуга",
    unit: String(item.unit ?? "").trim() || null,
    volume: decimalValue(item.volume),
    tariff: decimalValue(item.tariff),
    charge_minor: minorValue(item.chargeAmount),
    recalculation_minor: minorValue(item.recalculationAmount),
    benefit_minor: minorValue(item.benefitAmount),
    total_minor: minorValue(item.totalAmount),
  }));
}

function normalizeMeters(value: unknown) {
  return objectItems(value).map((item, position) => ({
    position,
    resource: String(item.resource ?? "").trim() || "Ресурс",
    meter_number: String(item.meterNumber ?? "").trim() || null,
    previous_value: decimalValue(item.previousValue),
    current_value: decimalValue(item.currentValue),
    consumption: decimalValue(item.consumption),
    unit: String(item.unit ?? "").trim() || null,
    tariff: decimalValue(item.tariff),
  }));
}

function normalizeOptionalCharges(value: unknown) {
  return objectItems(value).flatMap((item, position) => {
    const amount = minorValue(item.amount);
    if (amount === null) return [];
    return [{
      position,
      label: String(item.label ?? "").trim() || "Добровольная услуга",
      kind: String(item.kind ?? "").trim() || null,
      amount_minor: amount,
      included_in_mandatory: Boolean(item.includedInMandatory),
    }];
  });
}

export function formatUtilityBill(bill: UtilityBillRow, signedReceiptUrl?: string) {
  return {
    id: bill.id,
    service: bill.service,
    period: bill.period,
    amount: Number(bill.amount),
    dueDate: bill.due_date_label,
    paidAt: bill.paid_at_label ?? undefined,
    status: bill.status,
    receiptUrl: signedReceiptUrl || bill.receipt_url || undefined,
    note: bill.note ?? undefined,
    allocation: bill.allocation,
    tenantAmount: Number(bill.tenant_amount),
    reimbursementStatus: bill.reimbursement_status,
    reimbursedAt: bill.reimbursed_at_label ?? undefined,
    source: bill.source,
    ownerConfirmedAt: bill.owner_confirmed_at ?? undefined,
    publishedAt: bill.published_at ?? undefined,
    createdAt: bill.created_at,
  };
}

export async function createUtilityBillRecord(
  admin: SupabaseClient,
  options: { apartmentId: string; payload: Record<string, unknown> },
) {
  const normalized = normalizeBillPayload(options.payload);
  if ("error" in normalized) return { ...normalized, status: 400 } as const;

  const { data, error } = await admin
    .from("utility_bills")
    .insert({
      apartment_id: options.apartmentId,
      id: `bill-${randomUUID().slice(0, 8)}`,
      ...normalized.bill,
    })
    .select("*")
    .single();

  if (error) return { error: error.message, status: 500 } as const;
  const billId = String(data.id);
  const children = [
    ["utility_bill_line_items", normalized.lineItems],
    ["utility_bill_meter_entries", normalized.meters],
    ["utility_bill_optional_charges", normalized.optionalCharges],
  ] as const;
  for (const [table, rows] of children) {
    if (!rows.length) continue;
    const { error: childError } = await admin.from(table).insert(rows.map((row) => ({
      apartment_id: options.apartmentId,
      utility_bill_id: billId,
      ...row,
    })));
    if (childError) {
      await admin.from("utility_bills").delete().eq("apartment_id", options.apartmentId).eq("id", billId);
      return { error: childError.message, status: 500 } as const;
    }
  }
  return { row: data as UtilityBillRow, bill: formatUtilityBill(data as UtilityBillRow) };
}
