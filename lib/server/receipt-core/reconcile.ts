import { minorDifference, multiplyDecimalsToMinor } from "./money";
import type {
  CanonicalReceipt, DraftDecision, MandatoryDueDecision, ReceiptCoreResult, Reconciliation,
} from "./types";

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, BigInt(0));
}

function e1(receipt: CanonicalReceipt): Reconciliation {
  const lines = receipt.serviceLines.filter((line) => line.role === "service_charge" && line.amountMinor !== null);
  if (receipt.accruedTotal.value === null || lines.length === 0) {
    return { equation: "E1", status: "insufficient", reasons: ["accrued_or_service_lines_missing"], sourceIds: [...receipt.accruedTotal.sourceTokenIds, ...lines.flatMap((line) => line.sourceTokenIds)] };
  }
  const actual = sum(lines.map((line) => line.amountMinor!));
  const expected = receipt.accruedTotal.value;
  const delta = minorDifference(actual, expected);
  const tolerance = BigInt(lines.length);
  return {
    equation: "E1", status: delta <= tolerance ? "closed" : "open",
    reasons: delta <= tolerance ? [] : ["service_sum_does_not_match_accrued"],
    sourceIds: [...receipt.accruedTotal.sourceTokenIds, ...lines.flatMap((line) => line.sourceTokenIds)],
    expectedMinor: expected, actualMinor: actual, deltaMinor: delta,
  };
}

function financialBases(receipt: CanonicalReceipt) {
  const accrued = receipt.accruedTotal.value;
  if (accrued === null) return null;
  const components = receipt.financialComponents.filter((component) => component.role !== "accrued_total" && component.role !== "payment_history");
  const periodRoles = new Set(["recalculation", "benefit", "penalty", "rounding"]);
  const balanceRoles = new Set(["opening_balance", "opening_debt", "opening_advance", "payment"]);
  const included = components.filter((component) => component.affectsDue === "include");
  const disputed = components.filter((component) => component.affectsDue === "unknown");
  const periodOnly = accrued + sum(included.filter((component) => periodRoles.has(component.role)).map((component) => component.amountMinor));
  const withBalance = periodOnly + sum(included.filter((component) => balanceRoles.has(component.role)).map((component) => component.amountMinor));
  const optional = sum(receipt.optionalCharges.flatMap((line) => line.amountMinor === null ? [] : [line.amountMinor]));
  return { periodOnly, withBalance, optional, disputed, periodRoles };
}

function e2(receipt: CanonicalReceipt): { result: Reconciliation; computedDue: bigint | null } {
  const bases = financialBases(receipt);
  const sourceIds = [
    ...receipt.accruedTotal.sourceTokenIds,
    ...receipt.financialComponents.flatMap((component) => component.sourceTokenIds),
    ...receipt.dueCandidates.flatMap((candidate) => candidate.sourceTokenIds),
  ];
  if (!bases || receipt.dueCandidates.length === 0) {
    return { result: { equation: "E2", status: "insufficient", reasons: ["balance_components_or_due_candidate_missing"], sourceIds }, computedDue: bases?.withBalance ?? null };
  }
  const matches: Array<{ candidate: CanonicalReceipt["dueCandidates"][number]; formula: string; value: bigint }> = [];
  for (const candidate of receipt.dueCandidates) {
    const scopes = candidate.scope === "unknown" ? ["period_only", "with_balance"] as const : [candidate.scope];
    const optionalModes = candidate.optional === "unknown" && bases.optional !== BigInt(0) ? ["excluded", "included"] as const : [candidate.optional === "included" ? "included" : "excluded"] as const;
    const disputedVariants = bases.disputed.length === 0 ? [false] : [false, true];
    for (const scope of scopes) for (const optionalMode of optionalModes) for (const includeDisputed of disputedVariants) {
      const base = scope === "period_only" ? bases.periodOnly : bases.withBalance;
      const applicableDisputed = bases.disputed.filter((component) => scope === "with_balance" || bases.periodRoles.has(component.role));
      const adjustment = includeDisputed ? sum(applicableDisputed.map((component) => component.amountMinor)) : BigInt(0);
      const value = base + adjustment + (optionalMode === "included" ? bases.optional : BigInt(0));
      const suffix = bases.disputed.length ? `:disputed_${includeDisputed ? "included" : "excluded"}` : "";
      if (minorDifference(value, candidate.amountMinor) <= BigInt(1)) matches.push({ candidate, formula: `${scope}:${optionalMode}${suffix}`, value });
    }
  }
  if (matches.length === 1) {
    const match = matches[0];
    return {
      result: { equation: "E2", status: "closed", reasons: [match.formula], sourceIds, expectedMinor: match.candidate.amountMinor, actualMinor: match.value, deltaMinor: minorDifference(match.candidate.amountMinor, match.value) },
      computedDue: bases.withBalance,
    };
  }
  if (matches.length > 1) {
    return { result: { equation: "E2", status: "ambiguous", reasons: matches.map((match) => `multiple_closures:${match.formula}`), sourceIds }, computedDue: bases.withBalance };
  }
  return { result: { equation: "E2", status: "open", reasons: ["printed_due_does_not_match_document_formula"], sourceIds }, computedDue: bases.withBalance };
}

function e3(receipt: CanonicalReceipt): Reconciliation[] {
  return receipt.serviceLines.flatMap((line) => {
    if (!line.volume || !line.tariff || line.amountMinor === null) return [];
    const computed = multiplyDecimalsToMinor(line.volume, line.tariff);
    const delta = minorDifference(computed, line.amountMinor);
    return [{
      equation: "E3" as const,
      status: delta <= BigInt(1) ? "closed" as const : "open" as const,
      reasons: delta <= BigInt(1) ? [] : ["volume_times_tariff_mismatch"],
      sourceIds: line.sourceTokenIds,
      expectedMinor: line.amountMinor,
      actualMinor: computed,
      deltaMinor: delta,
    }];
  });
}

function mandatoryDue(receipt: CanonicalReceipt, reconciliation: Reconciliation, computedDue: bigint | null): MandatoryDueDecision {
  if (receipt.dueCandidates.length === 0) return { status: "absent", valueMinor: null, source: null, reasons: ["printed_due_absent"] };
  const [candidate] = receipt.dueCandidates;
  if (receipt.dueCandidates.length === 1 && candidate.optional === "excluded" && reconciliation.status === "closed") {
    return { status: "confirmed", valueMinor: candidate.amountMinor, source: "printed", reasons: [] };
  }
  if (receipt.dueCandidates.length === 1 && candidate.optional === "included" && computedDue !== null) {
    return { status: "needs_review", valueMinor: computedDue, source: "computed_excluding_optional", reasons: ["only_optional_inclusive_total_printed"] };
  }
  return {
    status: "needs_review", valueMinor: candidate?.amountMinor ?? null, source: candidate ? "printed" : null,
    reasons: [receipt.dueCandidates.length > 1 ? "multiple_due_candidates" : `due_reconciliation_${reconciliation.status}`, candidate?.optional === "unknown" ? "optional_semantics_unknown" : ""].filter(Boolean),
  };
}

function draftDecision(receipt: CanonicalReceipt, mandatory: MandatoryDueDecision): DraftDecision {
  const anyAmount = receipt.accruedTotal.value !== null || receipt.dueCandidates.length > 0 || receipt.financialComponents.length > 0 ||
    receipt.serviceLines.some((line) => line.amountMinor !== null) || receipt.optionalCharges.some((line) => line.amountMinor !== null);
  const reasons: string[] = [];
  if (receipt.documentKind !== "utility") reasons.push("not_utility_document");
  if (!receipt.readable) reasons.push("document_unreadable");
  if (receipt.period.value === null && !anyAmount) reasons.push("period_and_amount_missing");
  if (reasons.length) return { decision: "reject", needsReview: true, includeInMonthlyTotal: false, reasons };
  if (mandatory.status === "confirmed") return { decision: "confirmed_draft", needsReview: false, includeInMonthlyTotal: true, reasons: [] };
  return { decision: "partial_draft", needsReview: true, includeInMonthlyTotal: false, reasons: mandatory.reasons };
}

export function reconcileReceipt(receipt: CanonicalReceipt): ReceiptCoreResult {
  const first = e1(receipt);
  const second = e2(receipt);
  const reconciliations = [first, second.result, ...e3(receipt)];
  const mandatory = mandatoryDue(receipt, second.result, second.computedDue);
  return {
    receipt,
    computedDue: second.computedDue,
    machineDue: null,
    reconciliations,
    mandatoryDue: mandatory,
    draft: draftDecision(receipt, mandatory),
  };
}

export function safeReceiptDiagnostic(result: ReceiptCoreResult) {
  return {
    documentKind: result.receipt.documentKind,
    readable: result.receipt.readable,
    fieldStates: {
      period: result.receipt.period.state,
      accruedTotal: result.receipt.accruedTotal.state,
      dueDate: result.receipt.dueDate.state,
    },
    counts: {
      financialComponents: result.receipt.financialComponents.length,
      dueCandidates: result.receipt.dueCandidates.length,
      serviceLines: result.receipt.serviceLines.length,
      optionalCharges: result.receipt.optionalCharges.length,
      meters: result.receipt.meters.length,
      unknownRows: result.receipt.unknownRowIds.length,
    },
    diagnostics: result.receipt.diagnostics.map((item) => ({ ...item, deltaMinor: item.deltaMinor?.toString() })),
    reconciliations: result.reconciliations.map((item) => ({
      equation: item.equation,
      status: item.status,
      reasons: item.reasons,
      sourceIds: item.sourceIds,
      deltaMinor: item.deltaMinor?.toString(),
    })),
    mandatoryDue: { status: result.mandatoryDue.status, source: result.mandatoryDue.source, reasons: result.mandatoryDue.reasons },
    draft: result.draft,
  };
}
