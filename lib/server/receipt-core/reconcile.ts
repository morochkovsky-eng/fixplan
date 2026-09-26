import { minorDifference, multiplyDecimalsToMinor } from "./money";
import type {
  AppliedFormula, CanonicalReceipt, ClosureSignal, ClosureStrength, DraftDecision, DueCandidate,
  FinancialComponent, MandatoryDueDecision, ReceiptCoreResult, Reconciliation,
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

function formulasForAxes(
  receipt: CanonicalReceipt,
  scopeValue: DueCandidate["scope"],
  optionalValue: DueCandidate["optional"],
  context: NonNullable<ReturnType<typeof financialContext>>,
) {
  const disputedCategories = [...new Set(context.disputed.map((component) => component.category))].sort();
  const axes = [
    ...(scopeValue === "unknown" ? ["$scope"] : []),
    ...(optionalValue === "unknown" && context.optional.some((component) => component.amountMinor !== BigInt(0)) ? ["$optional"] : []),
    ...disputedCategories,
  ];
  if (axes.length > 3) return { formulas: [] as AppliedFormula[], tooManyAxes: true };
  const variants = combinations(axes);
  const formulas = variants.map((enabled): AppliedFormula => {
    const scope = scopeValue === "unknown" ? (enabled.has("$scope") ? "with_balance" : "period_only") : scopeValue;
    const optional = optionalValue === "unknown" ? (enabled.has("$optional") ? "included" : "excluded") : optionalValue;
    const fixed = context.fixed.filter((component) => component.area === "period" || scope === "with_balance");
    const disputed = context.disputed.filter((component) => (component.area === "period" || scope === "with_balance") && enabled.has(component.category));
    const optionalComponents = optional === "included" ? context.optional : [];
    const included = [...fixed, ...disputed, ...optionalComponents];
    return {
      scope,
      optional,
      includedComponentIds: [context.accruedId, ...included.filter((component) => component.amountMinor !== BigInt(0)).map((component) => component.id)].sort(),
      optionalComponentIds: optionalComponents.map((component) => component.id).sort(),
      valueMinor: receipt.accruedTotal.value! + sum(included.map((component) => component.amountMinor)),
    };
  });
  const unique = new Map(formulas.map((formula) => [materialKey(formula), formula]));
  return { formulas: [...unique.values()], tooManyAxes: false };
}

function formulasForCandidate(receipt: CanonicalReceipt, candidate: DueCandidate, context: NonNullable<ReturnType<typeof financialContext>>) {
  return formulasForAxes(receipt, candidate.scope, candidate.optional, context);
}

type E2Outcome = {
  result: Reconciliation;
  computedClosingBalance: bigint | null;
  computedDue: bigint | null;
  diagnosticComputedDue: bigint | null;
  computedExcludingOptional: bigint | null;
};

function outcome(
  result: Reconciliation,
  diagnosticComputedDue: bigint | null,
  formula?: AppliedFormula,
  context?: NonNullable<ReturnType<typeof financialContext>>,
  closesBalance = false,
): E2Outcome {
  const optionalIds = new Set(formula?.optionalComponentIds ?? []);
  const optionalAmount = context ? sum(context.optional.filter((component) => optionalIds.has(component.id)).map((component) => component.amountMinor)) : BigInt(0);
  const computedClosingBalance = closesBalance ? formula?.valueMinor ?? null : null;
  const formulaDue = formula ? formula.valueMinor - optionalAmount : null;
  return {
    result: result.equation === "E2" && !result.closureStrength
      ? { ...result, closureStrength: { componentCount: 0, componentSourceIds: [], signals: [], rating: "weak", reason: "e2_not_closed" } }
      : result,
    computedClosingBalance,
    computedDue: formula ? (closesBalance && formula.valueMinor < BigInt(0) ? BigInt(0) : formula.valueMinor) : null,
    diagnosticComputedDue,
    computedExcludingOptional: formulaDue === null ? null : closesBalance && formulaDue < BigInt(0) ? BigInt(0) : formulaDue,
  };
}

function blockId(sourceId: string) {
  return sourceId.match(/^(p\d+\.b\d+)/u)?.[1] ?? sourceId;
}

function closureStrength(receipt: CanonicalReceipt, formula: AppliedFormula, candidate: DueCandidate | undefined, e1Result: Reconciliation): ClosureStrength {
  const sourceGroups: string[][] = [];
  if (formula.includedComponentIds.some((id) => id.startsWith("accrued:"))) sourceGroups.push(receipt.accruedTotal.sourceTokenIds);
  for (const component of receipt.financialComponents) {
    if (formula.includedComponentIds.includes(component.id)) sourceGroups.push(component.sourceTokenIds);
  }
  for (const optional of receipt.optionalCharges) {
    if (formula.includedComponentIds.includes(optional.id)) sourceGroups.push(optional.sourceTokenIds);
  }
  const uniqueGroups = new Map<string, string[]>();
  for (const group of sourceGroups) {
    const ids = [...new Set(group)].sort();
    if (ids.length) uniqueGroups.set(ids.join("|"), ids);
  }
  const signals: ClosureSignal[] = [];
  if (e1Result.status === "closed") signals.push("e1_closed");
  if (candidate && new Set(candidate.sourceTokenIds.map(blockId)).size >= 2) signals.push("independent_due_repeat");
  const componentCount = uniqueGroups.size;
  const strong = componentCount >= 2 || (componentCount === 1 && signals.length > 0);
  return {
    componentCount,
    componentSourceIds: [...new Set([...uniqueGroups.values()].flat())].sort(),
    signals,
    rating: strong ? "strong" : "weak",
    reason: componentCount >= 2 ? "multiple_independent_financial_components"
      : signals.includes("e1_closed") ? "single_component_with_e1"
        : signals.includes("independent_due_repeat") ? "single_component_with_independent_due_repeat"
          : "single_component_without_independent_confirmation",
  };
}

function selectClosure(group: Array<{ candidate: DueCandidate; formula: AppliedFormula }>) {
  const excluded = [...new Map(group.filter((entry) => entry.candidate.optional === "excluded").map((entry) => [entry.candidate.id, entry])).values()];
  return excluded.length === 1 ? excluded[0] : group.length === 1 ? group[0] : null;
}

function e2(receipt: CanonicalReceipt, e1Result: Reconciliation): E2Outcome {
  if (receipt.diagnostics.some((diagnostic) => diagnostic.code === "fixed_role_sign_conflict")) {
    return outcome({ equation: "E2", status: "ambiguous", reasons: ["fixed_role_sign_conflict"], sourceIds: [] }, null);
  }
  const context = financialContext(receipt);
  const sourceIds = [
    ...receipt.accruedTotal.sourceTokenIds,
    ...receipt.financialComponents.flatMap((component) => component.sourceTokenIds),
    ...receipt.closingBalance.sourceTokenIds,
    ...receipt.dueCandidates.flatMap((candidate) => candidate.sourceTokenIds),
  ];
  if (!context) return outcome({ equation: "E2", status: "insufficient", reasons: ["accrued_total_missing"], sourceIds }, null);
  const diagnosticComputedDue = context.knownWithBalance;
  if (context.signConflicts.length) {
    return outcome({ equation: "E2", status: "ambiguous", reasons: ["fixed_role_sign_conflict"], sourceIds }, diagnosticComputedDue);
  }

  const closingBalanceInvalid = receipt.diagnostics.find((diagnostic) => diagnostic.code === "closing_balance_sign_missing" || diagnostic.code === "multiple_closing_balances");
  if (closingBalanceInvalid) {
    const diagnosticDue = diagnosticComputedDue < BigInt(0) ? BigInt(0) : diagnosticComputedDue;
    return outcome({
      equation: "E2", status: "ambiguous", reasons: [closingBalanceInvalid.code], sourceIds, target: "closing_balance",
    }, diagnosticDue, undefined, undefined, true);
  }

  if (receipt.closingBalance.value !== null) {
    const diagnosticDue = diagnosticComputedDue < BigInt(0) ? BigInt(0) : diagnosticComputedDue;
    const generated = formulasForAxes(receipt, "with_balance", "excluded", context);
    if (generated.tooManyAxes) {
      return outcome({ equation: "E2", status: "ambiguous", reasons: ["too_many_disputed_categories"], sourceIds, target: "closing_balance" }, diagnosticDue, undefined, undefined, true);
    }
    const matching = generated.formulas.filter((formula) => minorDifference(formula.valueMinor, receipt.closingBalance.value!) <= BigInt(1));
    const groups = new Map(matching.map((formula) => [materialKey(formula), formula]));
    if (groups.size > 1) {
      return outcome({ equation: "E2", status: "ambiguous", reasons: ["multiple_materially_distinct_closures"], sourceIds, target: "closing_balance" }, diagnosticDue, undefined, undefined, true);
    }
    if (groups.size === 0) {
      return outcome({
        equation: "E2", status: "open", reasons: ["closing_balance_does_not_match_document_formula"], sourceIds, target: "closing_balance",
        expectedMinor: receipt.closingBalance.value, actualMinor: diagnosticComputedDue,
        deltaMinor: minorDifference(receipt.closingBalance.value, diagnosticComputedDue),
      }, diagnosticDue, undefined, undefined, true);
    }
    const formula = [...groups.values()][0];
    const printedDue = receipt.closingBalance.value > BigInt(0) ? receipt.closingBalance.value : BigInt(0);
    const candidateMatches = receipt.dueCandidates.flatMap((candidate) => minorDifference(candidate.amountMinor, printedDue) <= BigInt(1) ? [{ candidate, formula }] : []);
    const selected = selectClosure(candidateMatches);
    if (receipt.dueCandidates.length > 0 && candidateMatches.length === 0) {
      return outcome({
        equation: "E2", status: "open", reasons: ["printed_due_does_not_match_closing_balance"], sourceIds, target: "closing_balance",
        expectedMinor: receipt.closingBalance.value, actualMinor: formula.valueMinor,
        deltaMinor: minorDifference(receipt.closingBalance.value, formula.valueMinor), formula,
      }, diagnosticDue, undefined, undefined, true);
    }
    if (candidateMatches.length > 0 && !selected) {
      return outcome({ equation: "E2", status: "ambiguous", reasons: ["multiple_candidates_for_closing_balance"], sourceIds, target: "closing_balance" }, diagnosticDue, undefined, undefined, true);
    }
    return outcome({
      equation: "E2", status: "closed", reasons: [], sourceIds, target: "closing_balance",
      expectedMinor: receipt.closingBalance.value, actualMinor: formula.valueMinor,
      deltaMinor: minorDifference(receipt.closingBalance.value, formula.valueMinor),
      candidateId: selected?.candidate.id, candidateSourceIds: selected?.candidate.sourceTokenIds, formula,
      closureStrength: closureStrength(receipt, formula, selected?.candidate, e1Result),
    }, diagnosticDue, formula, context, true);
  }

  if (receipt.dueCandidates.length === 0) {
    return outcome({ equation: "E2", status: "insufficient", reasons: ["printed_due_candidate_missing"], sourceIds, target: "due_candidate" }, diagnosticComputedDue);
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
    return outcome({ equation: "E2", status: "ambiguous", reasons: ["too_many_disputed_categories"], sourceIds, target: "due_candidate" }, diagnosticComputedDue);
  }
  const materialGroups = new Map<string, typeof closures>();
  for (const closure of closures) {
    const key = materialKey(closure.formula);
    materialGroups.set(key, [...(materialGroups.get(key) ?? []), closure]);
  }
  if (materialGroups.size > 1) {
    return outcome({ equation: "E2", status: "ambiguous", reasons: ["multiple_materially_distinct_closures"], sourceIds, target: "due_candidate" }, diagnosticComputedDue);
  }
  if (materialGroups.size === 1) {
    const group = [...materialGroups.values()][0];
    const selected = selectClosure(group);
    if (!selected) {
      return outcome({ equation: "E2", status: "ambiguous", reasons: ["multiple_candidates_for_same_formula"], sourceIds, target: "due_candidate" }, diagnosticComputedDue);
    }
    return outcome({
        equation: "E2", status: "closed", reasons: [], sourceIds,
        target: "due_candidate",
        expectedMinor: selected.candidate.amountMinor, actualMinor: selected.formula.valueMinor,
        deltaMinor: minorDifference(selected.candidate.amountMinor, selected.formula.valueMinor),
        candidateId: selected.candidate.id, candidateSourceIds: selected.candidate.sourceTokenIds,
        formula: selected.formula,
        closureStrength: closureStrength(receipt, selected.formula, selected.candidate, e1Result),
      }, diagnosticComputedDue, selected.formula, context);
  }
  return outcome({ equation: "E2", status: "open", reasons: ["printed_due_does_not_match_document_formula"], sourceIds, target: "due_candidate" }, diagnosticComputedDue);
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

function mandatoryDue(receipt: CanonicalReceipt, e2Result: E2Outcome): MandatoryDueDecision {
  const { result: reconciliation, computedDue, diagnosticComputedDue, computedExcludingOptional } = e2Result;
  if (receipt.dueCandidates.length === 0) {
    const reviewValue = receipt.closingBalance.value !== null && computedDue !== null
      ? (computedDue > BigInt(0) ? computedDue : BigInt(0))
      : diagnosticComputedDue;
    if (reviewValue !== null) return { status: "needs_review", valueMinor: reviewValue, source: "computed", reasons: ["printed_due_absent"] };
    return { status: "absent", valueMinor: null, source: null, reasons: ["printed_due_absent"] };
  }
  const selected = reconciliation.candidateId ? receipt.dueCandidates.find((candidate) => candidate.id === reconciliation.candidateId) : undefined;
  if (reconciliation.status === "closed" && reconciliation.closureStrength?.rating === "weak" && selected) {
    return {
      status: "needs_review", valueMinor: selected.amountMinor, source: "printed",
      reasons: ["weak_e2_closure"], candidateId: selected.id, candidateSourceIds: selected.sourceTokenIds,
    };
  }
  if (reconciliation.status === "closed" && selected?.optional === "excluded") {
    return {
      status: "confirmed", valueMinor: selected.amountMinor, source: "printed", reasons: [],
      candidateId: selected.id, candidateSourceIds: selected.sourceTokenIds,
    };
  }
  if (reconciliation.status === "closed" && selected?.optional === "included" && computedExcludingOptional !== null) {
    return {
      status: "needs_review", valueMinor: computedExcludingOptional, source: "computed_excluding_optional",
      reasons: ["only_optional_inclusive_total_printed"], candidateId: selected.id, candidateSourceIds: selected.sourceTokenIds,
    };
  }
  const fallback = receipt.dueCandidates.length === 1 ? receipt.dueCandidates[0] : undefined;
  return {
    status: "needs_review",
    valueMinor: fallback?.amountMinor ?? diagnosticComputedDue,
    source: fallback ? "printed" : diagnosticComputedDue !== null ? "computed" : null,
    reasons: [receipt.dueCandidates.length > 1 ? "multiple_due_candidates" : `due_reconciliation_${reconciliation.status}`, fallback?.optional === "unknown" ? "optional_semantics_unknown" : ""].filter(Boolean),
    candidateId: fallback?.id,
    candidateSourceIds: fallback?.sourceTokenIds,
  };
}

function draftDecision(receipt: CanonicalReceipt, mandatory: MandatoryDueDecision, e2Result: Reconciliation): DraftDecision {
  const anyAmount = receipt.accruedTotal.value !== null || receipt.closingBalance.value !== null || receipt.dueCandidates.length > 0 || receipt.financialComponents.length > 0 ||
    receipt.serviceLines.some((line) => line.amountMinor !== null) || receipt.optionalCharges.some((line) => line.amountMinor !== null);
  if (receipt.documentKind === "other") return { decision: "reject", needsReview: true, includeInMonthlyTotal: false, reasons: ["confirmed_other_document"] };
  if (!receipt.readable) return { decision: "reject", needsReview: true, includeInMonthlyTotal: false, reasons: ["document_unreadable"] };
  if (receipt.period.value === null && !anyAmount) return { decision: "reject", needsReview: true, includeInMonthlyTotal: false, reasons: ["period_and_amount_missing"] };
  if (receipt.documentKind === "unknown") return { decision: "partial_draft", needsReview: true, includeInMonthlyTotal: false, reasons: ["document_kind_unknown", ...mandatory.reasons] };
  if (receipt.period.parseStatus !== "parsed") return { decision: "partial_draft", needsReview: true, includeInMonthlyTotal: false, reasons: [`billing_period_${receipt.period.parseStatus}`, ...mandatory.reasons] };
  if (mandatory.status === "confirmed" && e2Result.closureStrength?.rating === "weak") {
    return { decision: "partial_draft", needsReview: true, includeInMonthlyTotal: false, reasons: ["weak_e2_closure"] };
  }
  if (mandatory.status === "confirmed") return { decision: "confirmed_draft", needsReview: false, includeInMonthlyTotal: true, reasons: [] };
  return { decision: "partial_draft", needsReview: true, includeInMonthlyTotal: false, reasons: mandatory.reasons };
}

export function reconcileReceipt(receipt: CanonicalReceipt): ReceiptCoreResult {
  const first = e1(receipt);
  const second = e2(receipt, first);
  const reconciliations = [first, second.result, ...e3(receipt)];
  let mandatory = mandatoryDue(receipt, second);
  let draft = draftDecision(receipt, mandatory, second.result);
  if (receipt.classificationValidity.status === "needs_review") {
    const reasons = [...new Set(["classification_needs_review", ...receipt.classificationValidity.reasons])];
    if (mandatory.status === "confirmed") mandatory = { ...mandatory, status: "needs_review", reasons };
    if (draft.decision !== "reject") draft = { decision: "partial_draft", needsReview: true, includeInMonthlyTotal: false, reasons: [...new Set([...draft.reasons, ...reasons])] };
  }
  return {
    receipt, computedClosingBalance: second.computedClosingBalance,
    computedDue: second.computedDue, diagnosticComputedDue: second.diagnosticComputedDue,
    machineDue: null, reconciliations, mandatoryDue: mandatory, draft,
  };
}

export function safeReceiptDiagnostic(result: ReceiptCoreResult) {
  return {
    documentKind: result.receipt.documentKind,
    readable: result.receipt.readable,
    fieldStates: {
      period: result.receipt.period.state,
      accruedTotal: result.receipt.accruedTotal.state,
      closingBalance: result.receipt.closingBalance.state,
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
      candidateId: item.candidateId,
      closureStrength: item.closureStrength,
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
