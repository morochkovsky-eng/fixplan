import type {
  CanonicalReceipt, ChargeLine, CoreDiagnostic, DueCandidate, FieldState, FinancialComponent,
  FinancialComponentRole, IndexedLiteralDocument, LiteralCell, LiteralDocument, MeterEntry,
  NormalizedField, NumericToken, SlotName, ValidatedClassification, ValidatedRoleItem,
} from "./types";
import { decimalToMinorExact } from "./money";

const FINANCIAL_ROLES = new Set<FinancialComponentRole>([
  "accrued_total", "opening_balance", "opening_debt", "opening_advance", "payment", "benefit",
  "recalculation", "penalty", "rounding", "payment_history",
]);
const FIXED_SIGNS = new Map<FinancialComponentRole, "positive" | "negative">([
  ["accrued_total", "positive"], ["opening_debt", "positive"], ["penalty", "positive"],
  ["opening_advance", "negative"], ["payment", "negative"], ["benefit", "negative"],
]);
const ROLE_VALUE_SLOT: Partial<Record<ValidatedRoleItem["role"], SlotName>> = {
  accrued_total: "accrued_total", opening_balance: "opening_balance", opening_debt: "opening_debt",
  opening_advance: "opening_advance", payment: "payment", benefit: "benefit", recalculation: "recalculation",
  penalty: "penalty", rounding: "rounding", payment_history: "payment_history", due_candidate: "due_candidate",
  closing_balance: "closing_balance",
  period: "period", due_date: "due_date", provider: "provider", account: "account", address: "address", issue_date: "issue_date",
};

function maps(document: LiteralDocument) {
  const cells = new Map<string, LiteralCell>();
  const tokens = new Map<string, NumericToken>();
  for (const page of document.pages) for (const block of page.blocks) for (const row of block.rows) for (const cell of row.cells) {
    cells.set(cell.id, cell);
    cell.numericTokens.forEach((token) => tokens.set(token.id, token));
  }
  return { cells, tokens };
}
function stateFromCells(cells: LiteralCell[]): FieldState {
  if (cells.some((cell) => cell.state === "present" && cell.text.trim())) return "printed";
  if (cells.some((cell) => cell.state === "illegible")) return "illegible";
  if (cells.some((cell) => cell.state === "blank")) return "printed_blank";
  return "absent";
}
function emptyField<T>(): NormalizedField<T> { return { state: "absent", value: null, sourceCellIds: [], sourceTokenIds: [] }; }
function slot(item: ValidatedRoleItem, name: SlotName) { return item.slots[name] ?? { cellIds: [], tokenIds: [] }; }
function slotCells(item: ValidatedRoleItem, name: SlotName, cells: Map<string, LiteralCell>) { return slot(item, name).cellIds.flatMap((id) => cells.get(id) ?? []); }
function slotTokens(item: ValidatedRoleItem, name: SlotName, tokens: Map<string, NumericToken>) { return slot(item, name).tokenIds.flatMap((id) => tokens.get(id) ?? []); }

function textField(items: ValidatedRoleItem[], role: ValidatedRoleItem["role"], cells: Map<string, LiteralCell>): NormalizedField<string> {
  const item = items.find((entry) => entry.role === role);
  const valueSlot = ROLE_VALUE_SLOT[role];
  if (!item || !valueSlot) return emptyField();
  const value = slot(item, valueSlot);
  if (item.declaredState === "not_applicable") return { state: "not_applicable", value: null, sourceCellIds: value.cellIds, sourceTokenIds: value.tokenIds };
  const sourceCells = value.cellIds.flatMap((id) => cells.get(id) ?? []);
  const state = stateFromCells(sourceCells);
  const text = state === "printed" ? sourceCells.filter((cell) => cell.state === "present").map((cell) => cell.text.trim()).filter(Boolean).join(" ") : null;
  return { state, value: text, sourceCellIds: value.cellIds, sourceTokenIds: value.tokenIds };
}

function moneyFromSlot(item: ValidatedRoleItem, name: SlotName, tokens: Map<string, NumericToken>, diagnostics: CoreDiagnostic[]) {
  const ids = slot(item, name).tokenIds;
  const exact = slotTokens(item, name, tokens).map((token) => ({ token, minor: decimalToMinorExact(token) })).filter((entry): entry is { token: NumericToken; minor: bigint } => entry.minor !== null);
  if (exact.length !== 1) {
    diagnostics.push({ code: exact.length === 0 ? "money_token_missing" : "money_token_ambiguous", severity: "review", rowId: item.rowId, sourceIds: ids });
    return null;
  }
  return exact[0];
}

function canonicalFinancialAmount(role: FinancialComponentRole, parsed: { token: NumericToken; minor: bigint }, item: ValidatedRoleItem, diagnostics: CoreDiagnostic[]) {
  const expected = FIXED_SIGNS.get(role);
  if (!expected) return { amountMinor: parsed.minor, confirmed: true };
  const absolute = parsed.minor < BigInt(0) ? -parsed.minor : parsed.minor;
  if (parsed.token.printedSign === "none") return { amountMinor: expected === "negative" ? -absolute : absolute, confirmed: true };
  const conflicts = (expected === "negative" && parsed.token.printedSign === "plus") || (expected === "positive" && parsed.token.printedSign === "minus");
  if (conflicts) {
    diagnostics.push({ code: "fixed_role_sign_conflict", severity: "review", rowId: item.rowId, sourceIds: [parsed.token.id] });
    return { amountMinor: parsed.minor, confirmed: false };
  }
  return { amountMinor: parsed.minor, confirmed: true };
}

function oneToken(item: ValidatedRoleItem, name: SlotName, tokens: Map<string, NumericToken>) {
  const values = slotTokens(item, name, tokens);
  return values.length === 1 ? values[0] : null;
}
function buildCharge(item: ValidatedRoleItem, tokens: Map<string, NumericToken>, diagnostics: CoreDiagnostic[]): ChargeLine {
  const amountSlot = item.role === "service_charge" ? "charge" : item.role === "subtotal" ? "row_total" : "optional_charge";
  const parsed = moneyFromSlot(item, amountSlot, tokens, diagnostics);
  return {
    id: item.id, role: item.role as ChargeLine["role"], amountMinor: parsed?.minor ?? null,
    volume: oneToken(item, "volume", tokens), tariff: oneToken(item, "tariff", tokens),
    sourceTokenIds: item.sourceTokenIds, needsReview: parsed === null,
  };
}
function textFromSlot(item: ValidatedRoleItem, name: SlotName, cells: Map<string, LiteralCell>) {
  return slotCells(item, name, cells).filter((cell) => cell.state === "present").map((cell) => cell.text.trim()).filter(Boolean).join(" ") || null;
}
function buildMeter(item: ValidatedRoleItem, cells: Map<string, LiteralCell>, tokens: Map<string, NumericToken>): MeterEntry {
  const currentCells = slotCells(item, "meter_curr", cells);
  const state = stateFromCells(currentCells);
  const current = oneToken(item, "meter_curr", tokens);
  return {
    id: item.id, number: textFromSlot(item, "meter_number", cells), previous: oneToken(item, "meter_prev", tokens),
    current: state === "printed" ? current : null, consumption: oneToken(item, "consumption", tokens),
    state: state === "printed" && !current ? "illegible" : state,
    sourceCellIds: item.sourceCellIds, sourceTokenIds: item.sourceTokenIds,
  };
}

function mergeDueCandidates(candidates: DueCandidate[], diagnostics: CoreDiagnostic[]) {
  const byAxis = new Map<string, DueCandidate>();
  const axesByAmount = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const amountKey = candidate.amountMinor.toString();
    const axisKey = `${candidate.scope}:${candidate.optional}`;
    axesByAmount.set(amountKey, new Set([...(axesByAmount.get(amountKey) ?? []), axisKey]));
    const key = `${amountKey}:${axisKey}`;
    const current = byAxis.get(key);
    if (!current) byAxis.set(key, { ...candidate, sourceItemIds: [...candidate.sourceItemIds], sourceTokenIds: [...candidate.sourceTokenIds] });
    else {
      current.sourceItemIds = [...new Set([...current.sourceItemIds, ...candidate.sourceItemIds])].sort();
      current.sourceTokenIds = [...new Set([...current.sourceTokenIds, ...candidate.sourceTokenIds])].sort();
    }
  }
  for (const [amount, axes] of axesByAmount) if (axes.size > 1) diagnostics.push({ code: "due_candidate_axis_conflict", severity: "review", sourceIds: [amount, ...[...axes].sort()] });
  return [...byAxis.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildCanonicalReceipt(indexed: IndexedLiteralDocument, validated: ValidatedClassification): CanonicalReceipt {
  const { document } = indexed;
  const { cells, tokens } = maps(document);
  const diagnostics = [...indexed.diagnostics, ...validated.diagnostics];
  const reviewRows = new Set(indexed.diagnostics.filter((entry) => entry.severity !== "warning" && entry.rowId).map((entry) => entry.rowId!));
  const items = validated.items.filter((item) => !reviewRows.has(item.rowId));
  const period = textField(items, "period", cells);
  const dueDate = textField(items, "due_date", cells);
  const accruedItem = items.find((item) => item.role === "accrued_total");
  let accruedTotal = emptyField<bigint>();
  if (accruedItem) {
    const value = slot(accruedItem, "accrued_total");
    const state = stateFromCells(value.cellIds.flatMap((id) => cells.get(id) ?? []));
    const parsed = moneyFromSlot(accruedItem, "accrued_total", tokens, diagnostics);
    const signed = parsed ? canonicalFinancialAmount("accrued_total", parsed, accruedItem, diagnostics) : null;
    accruedTotal = { state: signed?.confirmed ? "printed" : state === "printed" ? "illegible" : state, value: signed?.confirmed ? signed.amountMinor : null, sourceCellIds: value.cellIds, sourceTokenIds: value.tokenIds };
  }
  const closingItem = items.find((item) => item.role === "closing_balance");
  let closingBalance = emptyField<bigint>();
  if (closingItem) {
    const value = slot(closingItem, "closing_balance");
    const state = stateFromCells(value.cellIds.flatMap((id) => cells.get(id) ?? []));
    const parsed = moneyFromSlot(closingItem, "closing_balance", tokens, diagnostics);
    closingBalance = {
      state: parsed ? "printed" : state === "printed" ? "illegible" : state,
      value: parsed?.minor ?? null,
      sourceCellIds: value.cellIds,
      sourceTokenIds: value.tokenIds,
    };
  }

  const financialComponents: FinancialComponent[] = [];
  const dueCandidates: DueCandidate[] = [];
  const serviceLines: ChargeLine[] = [];
  const optionalCharges: ChargeLine[] = [];
  const meters: MeterEntry[] = [];
  for (const item of items) {
    if (FINANCIAL_ROLES.has(item.role as FinancialComponentRole)) {
      const role = item.role as FinancialComponentRole;
      const parsed = moneyFromSlot(item, ROLE_VALUE_SLOT[role]!, tokens, diagnostics);
      if (parsed) {
        const signed = canonicalFinancialAmount(role, parsed, item, diagnostics);
        financialComponents.push({ id: item.id, role, printedAmountMinor: parsed.minor, amountMinor: signed.amountMinor, affectsDue: item.affectsDue ?? "include", confirmed: signed.confirmed, sourceTokenIds: [parsed.token.id] });
      }
    }
    if (item.role === "due_candidate") {
      const parsed = moneyFromSlot(item, "due_candidate", tokens, diagnostics);
      if (parsed) dueCandidates.push({ id: item.id, amountMinor: parsed.minor, scope: item.dueScope ?? "unknown", optional: item.optionalScope ?? "unknown", sourceItemIds: [item.id], sourceTokenIds: [parsed.token.id] });
    }
    if (item.role === "service_charge" || item.role === "subtotal" || item.role === "optional_charge") {
      const line = buildCharge(item, tokens, diagnostics);
      if (item.role === "optional_charge") optionalCharges.push(line); else serviceLines.push(line);
    }
    if (item.role === "meter_reading") meters.push(buildMeter(item, cells, tokens));
  }
  return {
    documentKind: validated.documentKind, readable: document.readable, period, accruedTotal, closingBalance, dueDate,
    financialComponents, dueCandidates: mergeDueCandidates(dueCandidates, diagnostics), serviceLines, optionalCharges, meters,
    unknownRowIds: validated.rows.filter((row) => row.items.some((item) => item.role === "unknown")).map((row) => row.rowId).sort(), diagnostics,
  };
}
