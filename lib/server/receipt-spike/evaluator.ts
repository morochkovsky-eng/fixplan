import {
  deterministicDecisionFingerprint, indexLiteralDocument, parseRoleClassification, processReceiptBundle,
} from "../receipt-core";
import type { LiteralCell, LiteralDocument, RoleClassification, VisualDocumentInput } from "../receipt-core";
import type { ClassifierInput, ClassifierMetrics, InputVariant, ReaderId, ReaderMetrics, SpikeEvaluation, ClassifierId } from "./contracts";
import { RECEIPT_SPIKE_SCHEMA_VERSION } from "./contracts";
import { parseClassifierOutput } from "./adapters";

type SemanticOracle = {
  fileId: string;
  roleClassification: RoleClassification;
  documents: Array<{ docId: string; expected: { billingPeriod: string | null; mandatoryDue: { valueMinor: string | null }; decision: string } }>;
};

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function cellMap(document: LiteralDocument) {
  return new Map(document.pages.flatMap((page) => page.blocks.flatMap((block) => block.rows.flatMap((row) => row.cells.map((cell) => [cell.id, cell] as const)))));
}

function flattenCells(document: LiteralDocument) {
  return document.pages.flatMap((page) => page.blocks.flatMap((block) => block.rows.flatMap((row) => row.cells)));
}

function textKey(cell: LiteralCell) {
  return `${cell.state}\u0000${cell.text.normalize("NFKC").trim().replace(/\s+/gu, " ")}`;
}

function tokenKeys(document: LiteralDocument) {
  return flattenCells(document).flatMap((cell) => cell.numericTokens.map((token) => `${token.raw}\u0000${token.printedSign}`));
}

function multiset(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function multisetSize(values: Map<string, number>) {
  return [...values.values()].reduce((sum, count) => sum + count, 0);
}

function intersectionSize(left: Map<string, number>, right: Map<string, number>) {
  let count = 0;
  for (const [value, occurrences] of left) count += Math.min(occurrences, right.get(value) ?? 0);
  return count;
}

function iou(left: LiteralCell["bbox"], right: LiteralCell["bbox"]) {
  if (left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height) return 1;
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? Math.max(0, Math.min(1, intersection / union)) : 1;
}

export function evaluateReader(
  expectedInput: VisualDocumentInput,
  actualInput: VisualDocumentInput,
  options: { geometryAvailable?: boolean; structureAvailable?: boolean } = {},
): ReaderMetrics {
  const geometryAvailable = options.geometryAvailable ?? true;
  const structureAvailable = options.structureAvailable ?? true;
  const expected = indexLiteralDocument(expectedInput).document;
  const actual = indexLiteralDocument(actualInput).document;
  const expectedCells = flattenCells(expected);
  const actualCells = flattenCells(actual);
  const expectedText = multiset(expectedCells.map(textKey));
  const actualText = multiset(actualCells.map(textKey));
  const textMatches = intersectionSize(expectedText, actualText);
  const expectedTokens = multiset(tokenKeys(expected));
  const actualTokens = multiset(tokenKeys(actual));
  const tokenMatches = intersectionSize(expectedTokens, actualTokens);
  const actualById = cellMap(actual);
  const positionalMatches = expectedCells.filter((cell) => {
    const candidate = actualById.get(cell.id);
    return candidate && candidate.text === cell.text && candidate.colSpan === cell.colSpan && candidate.rowSpan === cell.rowSpan;
  }).length;
  const geometry = expectedCells.flatMap((cell) => {
    const candidate = actualById.get(cell.id);
    return candidate ? [iou(cell.bbox, candidate.bbox)] : [];
  });
  const illegible = expectedCells.filter((cell) => cell.state === "illegible");
  return {
    textPrecision: ratio(textMatches, multisetSize(actualText)),
    textRecall: ratio(textMatches, multisetSize(expectedText)),
    numericPrecision: ratio(tokenMatches, multisetSize(actualTokens)),
    numericRecall: ratio(tokenMatches, multisetSize(expectedTokens)),
    rowColumnAccuracy: structureAvailable ? ratio(positionalMatches, expectedCells.length) : null,
    structureMetricStatus: structureAvailable ? "measured" : "not_applicable_reader_has_no_table_contract",
    geometryAccuracy: geometryAvailable ? ratio(geometry.reduce((sum, value) => sum + value, 0), expectedCells.length) : null,
    blankCellsFilled: expectedCells.filter((cell) => cell.state === "blank" && Boolean(actualById.get(cell.id)?.text.trim())).length,
    illegibleCellsFilled: illegible.length ? illegible.filter((cell) => Boolean(actualById.get(cell.id)?.text.trim())).length : null,
    illegibleMetricStatus: illegible.length ? "measured" : "not_tested_no_illegible_cells",
  };
}

function precisionRecall(expected: Set<string>, actual: Set<string>) {
  const expectedCounts = multiset([...expected]);
  const actualCounts = multiset([...actual]);
  const matches = intersectionSize(expectedCounts, actualCounts);
  return { precision: ratio(matches, actual.size), recall: ratio(matches, expected.size) };
}

const MONEY_ROLES = new Set([
  "service_charge", "optional_charge", "subtotal", "accrued_total", "opening_balance", "opening_debt", "opening_advance",
  "payment", "benefit", "recalculation", "penalty", "rounding", "closing_balance", "closing_debt", "closing_advance",
  "due_candidate", "payment_history",
]);

function classificationSets(classification: RoleClassification) {
  const roles = new Set<string>();
  const moneyRoles = new Set<string>();
  const slots = new Set<string>();
  for (const row of classification.rows) for (const item of row.items) {
    const roleKey = `${row.rowId}\u0000${item.role}`;
    roles.add(roleKey);
    if (MONEY_ROLES.has(item.role)) moneyRoles.add(roleKey);
    for (const [name, binding] of Object.entries(item.slots)) {
      const value = "cellIds" in binding
        ? { cellIds: [...binding.cellIds].sort(), tokenIds: [...(binding.tokenIds ?? [])].sort(), textRange: binding.textRange ?? null }
        : { columnKey: binding.columnKey, tokenIds: [...(binding.tokenIds ?? [])].sort() };
      slots.add(`${roleKey}\u0000${name}\u0000${JSON.stringify(value)}`);
    }
  }
  const segments = new Set(classification.documents.flatMap((document) => document.rowIds.map((rowId) => `${document.docId}\u0000${document.documentKind}\u0000${rowId}`)));
  for (const rowId of classification.sharedRowIds) segments.add(`shared\u0000${rowId}`);
  return { roles, moneyRoles, slots, segments };
}

export function evaluateClassifier(expectedValue: unknown, actualValue: unknown): ClassifierMetrics {
  const expected = classificationSets(parseRoleClassification(expectedValue));
  const actual = classificationSets(parseClassifierOutput(actualValue));
  const roles = precisionRecall(expected.roles, actual.roles);
  const slots = precisionRecall(expected.slots, actual.slots);
  const money = precisionRecall(expected.moneyRoles, actual.moneyRoles);
  const segments = precisionRecall(expected.segments, actual.segments);
  return {
    rolePrecision: roles.precision,
    roleRecall: roles.recall,
    slotPrecision: slots.precision,
    slotRecall: slots.recall,
    monetaryRoleAccuracy: (money.precision + money.recall) / 2,
    segmentationAccuracy: (segments.precision + segments.recall) / 2,
  };
}

export function prepareClassifierInput(fileId: string, input: VisualDocumentInput): ClassifierInput {
  return { schemaVersion: RECEIPT_SPIKE_SCHEMA_VERSION, fileId, literalDocument: indexLiteralDocument(input).document };
}

export function stringifyClassifierInput(input: ClassifierInput) {
  return JSON.stringify(input, (_key, value) => typeof value === "bigint" ? value.toString() : value);
}

export function evaluateEndToEnd(options: {
  fileId: string;
  variant: InputVariant;
  runNumber: number;
  readerId: ReaderId;
  classifierId: ClassifierId;
  readerInput: VisualDocumentInput;
  readerOracle?: VisualDocumentInput;
  geometryAvailable?: boolean;
  structureAvailable?: boolean;
  classifierOutput: unknown;
  semanticOracle: SemanticOracle;
}): SpikeEvaluation {
  const classification = parseClassifierOutput(options.classifierOutput);
  const indexed = indexLiteralDocument(options.readerInput);
  const bundle = processReceiptBundle(indexed, classification);
  const actualById = new Map(bundle.documents.map((document) => [document.docId, document.result]));
  const decisions = options.semanticOracle.documents.map(({ docId, expected }) => {
    const actual = actualById.get(docId);
    const criticalFieldsMatch = actual ? actual.receipt.period.value === expected.billingPeriod &&
      (actual.mandatoryDue.valueMinor?.toString() ?? null) === expected.mandatoryDue.valueMinor : false;
    return { docId, expected: expected.decision, actual: actual?.draft.decision ?? null, criticalFieldsMatch };
  });
  const silentCriticalErrors = decisions.filter((decision) => decision.actual === "confirmed_draft" && !decision.criticalFieldsMatch).length;
  const falseRejects = decisions.filter((decision) => decision.expected !== "reject" && decision.actual === "reject").length;
  return {
    fileId: options.fileId,
    variant: options.variant,
    runNumber: options.runNumber,
    readerId: options.readerId,
    classifierId: options.classifierId,
    readerMetrics: options.readerOracle ? evaluateReader(options.readerOracle, options.readerInput, {
      geometryAvailable: options.geometryAvailable,
      structureAvailable: options.structureAvailable,
    }) : null,
    classifierMetrics: evaluateClassifier(options.semanticOracle.roleClassification, classification),
    expectedDocumentIds: options.semanticOracle.documents.map((entry) => entry.docId).sort(),
    producedDocumentIds: bundle.documents.map((entry) => entry.docId).sort(),
    decisions,
    silentCriticalErrors,
    falseRejects,
    decisionFingerprint: deterministicDecisionFingerprint(bundle.documents.map((entry) => ({ docId: entry.docId, result: entry.result }))),
  };
}

export function assertNoEvaluatorLeak(paths: string[]) {
  const forbiddenSegments = new Set(["oracle", "gold", "reports"]);
  const forbiddenNames = ["literal_source", "literal_photo", "geometry_photo", "semantic"];
  for (const candidate of paths) {
    const normalized = candidate.replaceAll("\\", "/").toLocaleLowerCase("en-US");
    const segments = normalized.split("/").filter(Boolean);
    if (segments.some((segment) => forbiddenSegments.has(segment)) || forbiddenNames.some((part) => normalized.includes(part))) {
      throw new Error(`evaluator_only_input_forbidden:${candidate}`);
    }
  }
}
