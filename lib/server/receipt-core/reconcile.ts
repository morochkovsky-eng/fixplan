import { minorDifference, multiplyDecimalsToMinor } from "./money";
import type {
  AppliedFormula, CanonicalReceipt, DraftDecision, DueCandidate, FinancialComponent,
  MandatoryDueDecision, ReceiptCoreResult, Reconciliation,
} from "./types";

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, BigInt(0));
}

function e1(receipt: CanonicalReceipt): Reconciliation {
  const lines = receipt.serviceLines.filter((line) => line.role === "service_charge" && line.amountMinor !== null && !line.needsReview);
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

const PERIOD_ROLES = new Set<FinancialComponent["role"]>(["recalculation", "benefit", "penalty", "rounding"]);
const BALANCE_ROLES = new Set<FinancialComponent["role"]>(["opening_balance", "opening_debt", "opening_advance", "payment"]);

type FormulaComponent = { id: string; amountMinor: bigint; category: string; area: "period" | "balance" | "optional" };

function financialContext(receipt: CanonicalReceipt) {
  if (receipt.accruedTotal.value === null) return null;
  const relevant = receipt.financialComponents.filter((component) => component.role !== "accrued_total" && component.role !== "payment_history" && component.affectsDue !== "already_in_accrual");
  const signConflicts = relevant.filter((component) => !component.confirmed);
  const confirmed = relevant.filter((component) => component.confirmed);
  const fixed = confirmed.filter((component) => component.affectsDue === "include").flatMap((component): FormulaComponent[] => {
    const area = PERIOD_ROLES.has(component.role) ? "period" : BALANCE_ROLES.has(component.role) ? "balance" : "period";
    return [{ id: component.id, amountMinor: component.amountMinor, category: component.role, area }];
  });
  const disputed = confirmed.filter((component) => component.affectsDue === "unknown").flatMap((component): FormulaComponent[] => {
    const area = PERIOD_ROLES.has(component.role) ? "period" : BALANCE_ROLES.has(component.role) ? "balance" : "period";
    return [{ id: component.id, amountMinor: component.amountMinor, category: component.role, area }];
  });
  const optional = receipt.optionalCharges.flatMap((line): FormulaComponent[] => line.amountMinor === null || line.needsReview ? [] : [{ id: line.id, amountMinor: line.amountMinor, category: "optional", area: "optional" }]);
  const accruedId = `accrued:${receipt.accruedTotal.sourceTokenIds.join("+")}`;
  const knownWithBalance = receipt.accruedTotal.value + sum(fixed.map((component) => component.amountMinor));
  return { accruedId, fixed, disputed, optional, signConflicts, knownWithBalance };
}

function combinations(names: string[]) {
  const result: Array<Set<string>> = [];
  const count = 2 ** names.length;
  for (let mask = 0; mask < count; mask += 1) {
    result.push(new Set(names.filter((_name, index) => (mask & (1 << index)) !== 0)));
  }
  return result;
}

function materialKey(formula: AppliedFormula) {
  return `${formula.valueMinor}:${[...formula.includedComponentIds].sort().join(",")}`;
}

function formulasForCandidate(receipt: CanonicalReceipt, candidate: DueCandidate, context: NonNullable<ReturnType<typeof financialContext>>) {
  const disputedCategories = [...new Set(context.disputed.map((component) => component.category))].sort();
  const axes = [
    ...(candidate.scope === "unknown" ? ["$scope"] : []),
    ...(candidate.optional === "unknown" && context.optional.some((component) => component.amountMinor !== BigInt(0)) ? ["$optional"] : []),
    ...disputedCategories,
  ];
  if (axes.length > 3) return { formulas: [] as AppliedFormula[], tooManyAxes: true };
  const variants = combinations(axes);
  const formulas = variants.map((enabled): AppliedFormula => {
    const scope = candidate.scope === "unknown" ? (enabled.has("$scope") ? "with_balance" : "period_only") : candidate.scope;
    const optional = candidate.optional === "unknown" ? (enabled.has("$optional") ? "included" : "excluded") : candidate.optional;
    const fixed = context.fixed.filter((component) => component.area === "period" || scope === "with_balance");
    const disputed = context.disputed.filter((component) => (component.area === "period" || scope === "with_balance") && enabled.has(component.category));
    const optionalComponents = optional === "included" ? context.optional : [];
    const included = [...fixed, ...disputed, ...optionalComponents];
    return {
      scope,
      optional,
      includedComponentIds: [context.accruedId, ...included.filter((component) => component.amountMinor !== BigInt(0)).map((component) => component.id)].sort(),
      valueMinor: receipt.accruedTotal.value! + sum(included.map((component) => component.amountMinor)),
    };
  });
  const unique = new Map(formulas.map((formula) => [materialKey(formula), formula]));
  return { formulas: [...unique.values()], tooManyAxes: false };
}

function e2(receipt: CanonicalReceipt): { result: Reconciliation; computedDue: bigint | null } {
  if (receipt.diagnostics.some((diagnostic) => diagnostic.code === "fixed_role_sign_conflict")) {
    return {
      result: { equation: "E2", status: "ambiguous", reasons: ["fixed_role_sign_conflict"], sourceIds: [] },
      computedDue: null,
    };
  }
  const context = financialContext(receipt);
  const sourceIds = [
    ...receipt.accruedTotal.sourceTokenIds,
    ...receipt.financialComponents.flatMap((component) => component.sourceTokenIds),
    ...receipt.dueCandidates.flatMap((candidate) => candidate.sourceTokenIds),
  ];
  if (!context) return { result: { equation: "E2", status: "insufficient", reasons: ["accrued_total_missing"], sourceIds }, computedDue: null };
  const computedDue = context.knownWithBalance;
  if (context.signConflicts.length) {
    return { result: { equation: "E2", status: "ambiguous", reasons: ["fixed_role_sign_conflict"], sourceIds }, computedDue };
  }
  if (receipt.dueCandidates.length === 0) {
    return { result: { equation: "E2", status: "insufficient", reasons: ["printed_due_candidate_missing"], sourceIds }, computedDue };
  }

  const closures: Array<{ candidate: DueCandidate; formula: AppliedFormula }> = [];
  let tooManyAxes = false;
  for (const candidate of receipt.dueCandidates) {
    const generated = formulasForCandidate(receipt, candidate, context);
    tooManyAxes ||= generated.tooManyAxes;
    for (const formula of generated.formulas) {
      if (minorDifference(formula.valueMinor, candidate.amountMinor) <= BigInt(1)) closures.push({ candidate, formula });
    }
  }
  if (tooManyAxes) {
    return { result: { equation: "E2", status: "ambiguous", reasons: ["too_many_disputed_categories"], sourceIds }, computedDue };
  }
  const materialGroups = new Map<string, typeof closures>();
  for (const closure of closures) {
    const key = materialKey(closure.formula);
    materialGroups.set(key, [...(materialGroups.get(key) ?? []), closure]);
  }
  if (materialGroups.size > 1) {
    return { result: { equation: "E2", status: "ambiguous", reasons: ["multiple_materially_distinct_closures"], sourceIds }, computedDue };
  }
  if (materialGroups.size === 1) {
    const group = [...materialGroups.values()][0];
    const excluded = [...new Map(group.filter((entry) => entry.candidate.optional === "excluded").map((entry) => [entry.candidate.id, entry])).values()];
    const selected = excluded.length === 1 ? excluded[0] : group.length === 1 ? group[0] : null;
    if (!selected) {
      return { result: { equation: "E2", status: "ambiguous", reasons: ["multiple_candidates_for_same_formula"], sourceIds }, computedDue };
    }
    return {
      result: {
        equation: "E2", status: "closed", reasons: [], sourceIds,
        expectedMinor: selected.candidate.amountMinor, actualMinor: selected.formula.valueMinor,
        deltaMinor: minorDifference(selected.candidate.amountMinor, selected.formula.valueMinor),
        candidateId: selected.candidate.id, candidateSourceIds: selected.candidate.sourceTokenIds,
        formula: selected.formula,
      },
      computedDue,
    };
  }
  return { result: { equation: "E2", status: "open", reasons: ["printed_due_does_not_match_document_formula"], sourceIds }, computedDue };
}

function e3(receipt: CanonicalReceipt): Reconciliation[] {
  return receipt.serviceLines.flatMap((line) => {
    if (line.needsReview || !line.volume || !line.tariff || line.amountMinor === null) return [];
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
  if (receipt.dueCandidates.length === 0) {
    if (computedDue !== null) return { status: "needs_review", valueMinor: computedDue, source: "computed", reasons: ["printed_due_absent"] };
    return { status: "absent", valueMinor: null, source: null, reasons: ["printed_due_absent"] };
  }
  const selected = reconciliation.candidateId ? receipt.dueCandidates.find((candidate) => candidate.id === reconciliation.candidateId) : undefined;
  if (reconciliation.status === "closed" && selected?.optional === "excluded") {
    return {
      status: "confirmed", valueMinor: selected.amountMinor, source: "printed", reasons: [],
      candidateId: selected.id, candidateSourceIds: selected.sourceTokenIds,
    };
  }
  if (reconciliation.status === "closed" && selected?.optional === "included" && computedDue !== null) {
    return {
      status: "needs_review", valueMinor: computedDue, source: "computed_excluding_optional",
      reasons: ["only_optional_inclusive_total_printed"], candidateId: selected.id, candidateSourceIds: selected.sourceTokenIds,
    };
  }
  const fallback = receipt.dueCandidates.length === 1 ? receipt.dueCandidates[0] : undefined;
  return {
    status: "needs_review",
    valueMinor: fallback?.amountMinor ?? computedDue,
    source: fallback ? "printed" : computedDue !== null ? "computed" : null,
    reasons: [receipt.dueCandidates.length > 1 ? "multiple_due_candidates" : `due_reconciliation_${reconciliation.status}`, fallback?.optional === "unknown" ? "optional_semantics_unknown" : ""].filter(Boolean),
    candidateId: fallback?.id,
    candidateSourceIds: fallback?.sourceTokenIds,
  };
}

function draftDecision(receipt: CanonicalReceipt, mandatory: MandatoryDueDecision): DraftDecision {
  const anyAmount = receipt.accruedTotal.value !== null || receipt.dueCandidates.length > 0 || receipt.financialComponents.length > 0 ||
    receipt.serviceLines.some((line) => line.amountMinor !== null) || receipt.optionalCharges.some((line) => line.amountMinor !== null);
  if (receipt.documentKind === "other") return { decision: "reject", needsReview: true, includeInMonthlyTotal: false, reasons: ["confirmed_other_document"] };
  if (!receipt.readable) return { decision: "reject", needsReview: true, includeInMonthlyTotal: false, reasons: ["document_unreadable"] };
  if (receipt.period.value === null && !anyAmount) return { decision: "reject", needsReview: true, includeInMonthlyTotal: false, reasons: ["period_and_amount_missing"] };
  if (receipt.documentKind === "unknown") return { decision: "partial_draft", needsReview: true, includeInMonthlyTotal: false, reasons: ["document_kind_unknown", ...mandatory.reasons] };
  if (mandatory.status === "confirmed") return { decision: "confirmed_draft", needsReview: false, includeInMonthlyTotal: true, reasons: [] };
  return { decision: "partial_draft", needsReview: true, includeInMonthlyTotal: false, reasons: mandatory.reasons };
}

export function reconcileReceipt(receipt: CanonicalReceipt): ReceiptCoreResult {
  const first = e1(receipt);
  const second = e2(receipt);
  const reconciliations = [first, second.result, ...e3(receipt)];
  const mandatory = mandatoryDue(receipt, second.result, second.computedDue);
  return { receipt, computedDue: second.computedDue, machineDue: null, reconciliations, mandatoryDue: mandatory, draft: draftDecision(receipt, mandatory) };
}

export function safeReceiptDiagnostic(result: ReceiptCoreResult) {
  return {
    documentKind: result.receipt.documentKind,
    readable: result.receipt.readable,
    fieldStates: { period: result.receipt.period.state, accruedTotal: result.receipt.accruedTotal.state, dueDate: result.receipt.dueDate.state },
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
      candidateId: item.candidateId,
      formula: item.formula ? {
        scope: item.formula.scope,
        optional: item.formula.optional,
        includedComponentIds: item.formula.includedComponentIds,
      } : undefined,
      deltaMinor: item.deltaMinor?.toString(),
    })),
    mandatoryDue: {
      status: result.mandatoryDue.status,
      source: result.mandatoryDue.source,
      reasons: result.mandatoryDue.reasons,
      candidateId: result.mandatoryDue.candidateId,
    },
    draft: result.draft,
  };
}
