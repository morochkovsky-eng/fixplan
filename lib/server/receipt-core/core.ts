import type {
  CanonicalReceipt, ChargeLine, CoreDiagnostic, DueCandidate, FieldState, FinancialComponent,
  FinancialComponentRole, IndexedLiteralDocument, LiteralCell, LiteralDocument, MeterEntry,
  NormalizedField, NumericToken, ValidatedClassification, ValidatedRoleItem,
} from "./types";
import { decimalToMinorExact } from "./money";

const FINANCIAL_ROLES = new Set<FinancialComponentRole>([
  "accrued_total", "opening_balance", "opening_debt", "opening_advance", "payment", "benefit",
  "recalculation", "penalty", "rounding", "payment_history",
]);

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

function emptyField<T>(): NormalizedField<T> {
  return { state: "absent", value: null, sourceCellIds: [], sourceTokenIds: [] };
}

function itemValueCellIds(item: ValidatedRoleItem) {
  return item.mode === "label_value" ? item.valueCellIds : item.sourceCellIds;
}

function textField(items: ValidatedRoleItem[], role: ValidatedRoleItem["role"], cells: Map<string, LiteralCell>): NormalizedField<string> {
  const item = items.find((entry) => entry.role === role);
  if (!item) return emptyField();
  if (item.declaredState === "not_applicable") return { state: "not_applicable", value: null, sourceCellIds: item.sourceCellIds, sourceTokenIds: [] };
  const valueIds = itemValueCellIds(item);
  const sourceCells = valueIds.flatMap((id) => cells.get(id) ?? []);
  const state = stateFromCells(sourceCells);
  const value = state === "printed" ? sourceCells.filter((cell) => cell.state === "present").map((cell) => cell.text.trim()).filter(Boolean).join(" ") : null;
  return { state, value, sourceCellIds: item.sourceCellIds, sourceTokenIds: item.sourceTokenIds };
}

function moneyFromItem(item: ValidatedRoleItem, tokens: Map<string, NumericToken>, diagnostics: CoreDiagnostic[]) {
  const values = item.sourceTokenIds.flatMap((id) => tokens.get(id) ?? []).map((token) => ({ token, minor: decimalToMinorExact(token) }));
  const exact = values.filter((entry): entry is { token: NumericToken; minor: bigint } => entry.minor !== null);
  if (exact.length !== 1) {
    diagnostics.push({ code: exact.length === 0 ? "money_token_missing" : "money_token_ambiguous", severity: "review", rowId: item.rowId, sourceIds: item.sourceTokenIds });
    return null;
  }
  return exact[0];
}

function canonicalSign(role: FinancialComponentRole, value: bigint) {
  const absolute = value < BigInt(0) ? -value : value;
  if (role === "opening_debt" || role === "accrued_total" || role === "penalty") return absolute;
  if (role === "opening_advance" || role === "payment" || role === "benefit") return -absolute;
  return value;
}

function buildCharge(item: ValidatedRoleItem, tokens: Map<string, NumericToken>, diagnostics: CoreDiagnostic[]): ChargeLine {
  const referenced = item.sourceTokenIds.flatMap((id) => tokens.get(id) ?? []);
  const amountToken = referenced.at(-1) ?? null;
  const amountMinor = amountToken ? decimalToMinorExact(amountToken) : null;
  if (amountToken && amountMinor === null) diagnostics.push({ code: "charge_amount_not_money", severity: "review", rowId: item.rowId, sourceIds: [amountToken.id] });
  return {
    role: item.role as ChargeLine["role"],
    amountMinor,
    volume: referenced.length >= 3 ? referenced[0] : null,
    tariff: referenced.length >= 3 ? referenced[1] : null,
    sourceTokenIds: item.sourceTokenIds,
    needsReview: amountMinor === null,
  };
}

function buildMeter(item: ValidatedRoleItem, cells: Map<string, LiteralCell>, tokens: Map<string, NumericToken>): MeterEntry {
  const sourceCells = itemValueCellIds(item).flatMap((id) => cells.get(id) ?? []);
  const state = stateFromCells(sourceCells);
  const referenced = item.sourceTokenIds.flatMap((id) => tokens.get(id) ?? []);
  return {
    reading: state === "printed" && referenced.length === 1 ? referenced[0] : null,
    state: state === "printed" && referenced.length !== 1 ? "illegible" : state,
    sourceCellIds: item.sourceCellIds,
    sourceTokenIds: item.sourceTokenIds,
  };
}

function mergeDueCandidates(candidates: DueCandidate[]) {
  const byAmount = new Map<string, DueCandidate>();
  for (const candidate of candidates) {
    const key = candidate.amountMinor.toString();
    const current = byAmount.get(key);
    if (!current) {
      byAmount.set(key, { ...candidate, sourceTokenIds: [...candidate.sourceTokenIds] });
      continue;
    }
    current.scope = current.scope === candidate.scope ? current.scope : "unknown";
    current.optional = current.optional === candidate.optional ? current.optional : "unknown";
    current.sourceTokenIds = [...new Set([...current.sourceTokenIds, ...candidate.sourceTokenIds])];
  }
  return [...byAmount.values()];
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
    const sourceCells = accruedItem.sourceCellIds.flatMap((id) => cells.get(id) ?? []);
    const state = stateFromCells(sourceCells);
    const parsed = moneyFromItem(accruedItem, tokens, diagnostics);
    accruedTotal = { state: parsed ? "printed" : state === "printed" ? "illegible" : state, value: parsed?.minor ?? null, sourceCellIds: accruedItem.sourceCellIds, sourceTokenIds: accruedItem.sourceTokenIds };
  }

  const financialComponents: FinancialComponent[] = [];
  const dueCandidates: DueCandidate[] = [];
  const serviceLines: ChargeLine[] = [];
  const optionalCharges: ChargeLine[] = [];
  const meters: MeterEntry[] = [];

  for (const item of items) {
    if (FINANCIAL_ROLES.has(item.role as FinancialComponentRole)) {
      const parsed = moneyFromItem(item, tokens, diagnostics);
      if (parsed) financialComponents.push({
        role: item.role as FinancialComponentRole,
        printedAmountMinor: parsed.minor,
        amountMinor: canonicalSign(item.role as FinancialComponentRole, parsed.minor),
        affectsDue: item.affectsDue ?? "include",
        sourceTokenIds: [parsed.token.id],
      });
    }
    if (item.role === "due_candidate") {
      const parsed = moneyFromItem(item, tokens, diagnostics);
      if (parsed) dueCandidates.push({ amountMinor: parsed.minor, scope: item.dueScope ?? "unknown", optional: item.optionalScope ?? "unknown", sourceTokenIds: [parsed.token.id] });
    }
    if (item.role === "service_charge" || item.role === "subtotal" || item.role === "optional_charge") {
      const line = buildCharge(item, tokens, diagnostics);
      if (item.role === "optional_charge") optionalCharges.push(line);
      else serviceLines.push(line);
    }
    if (item.role === "meter_reading") meters.push(buildMeter(item, cells, tokens));
  }

  return {
    documentKind: document.documentKind,
    readable: document.readable,
    period,
    accruedTotal,
    dueDate,
    financialComponents,
    dueCandidates: mergeDueCandidates(dueCandidates),
    serviceLines,
    optionalCharges,
    meters,
    unknownRowIds: validated.rows.filter((row) => row.role === "unknown").map((row) => row.rowId),
    diagnostics,
  };
}
