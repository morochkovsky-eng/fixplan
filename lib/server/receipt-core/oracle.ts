import { createHash } from "node:crypto";
import { indexLiteralDocument, ReceiptContractError } from "./literal";
import type { LiteralDocument, NumericToken, ReceiptEvalRecord, VisualDocumentInput } from "./types";

export type OracleGeometry =
  | { status: "source" | "transformed"; coordinateSpace: string }
  | { status: "unavailable"; reason: "photo_transform_missing" | "generator_geometry_missing" };

export type OracleContentStructure = {
  readable: boolean;
  pages: Array<{
    id: string;
    blocks: Array<{
      id: string;
      layout: string;
      columnCount: number;
      rows: Array<{
        id: string;
        normalizedTextHash: string;
        cells: Array<{
          id: string;
          text: string;
          state: string;
          colSpan: number;
          rowSpan: number;
          isHeader?: boolean;
          numericTokens: NumericToken[];
        }>;
      }>;
    }>;
  }>;
};

type LiteralOracleBase = {
  source: "generator_export";
  variant: "source" | "photo_telegram";
  contentStructure: OracleContentStructure;
};
export type LiteralOracle =
  | (LiteralOracleBase & { literal: LiteralDocument; geometry: Exclude<OracleGeometry, { status: "unavailable" }> })
  | (LiteralOracleBase & { literal: null; geometry: Extract<OracleGeometry, { status: "unavailable" }> });

function contentStructure(document: LiteralDocument): OracleContentStructure {
  return {
    readable: document.readable,
    pages: document.pages.map((page) => ({
      id: page.id,
      blocks: page.blocks.map((block) => ({
        id: block.id,
        layout: block.layout,
        columnCount: block.columnCount,
        rows: block.rows.map((row) => ({
          id: row.id,
          normalizedTextHash: row.normalizedTextHash,
          cells: row.cells.map((cell) => ({
            id: cell.id,
            text: cell.text,
            state: cell.state,
            colSpan: cell.colSpan,
            rowSpan: cell.rowSpan,
            isHeader: cell.isHeader,
            numericTokens: cell.numericTokens,
          })),
        })),
      })),
    })),
  };
}

export function exportGeneratorLiteral(
  generatorDocument: VisualDocumentInput,
  options: { variant?: "source" | "photo_telegram"; transformedDocument?: VisualDocumentInput } = {},
): LiteralOracle {
  const variant = options.variant ?? "source";
  if (variant === "source" && options.transformedDocument) {
    throw new ReceiptContractError("source_transform_conflict", "source oracle cannot use transformed coordinates");
  }
  const source = indexLiteralDocument(generatorDocument).document;
  if (variant === "photo_telegram" && !options.transformedDocument) {
    return {
      source: "generator_export", variant, literal: null, contentStructure: contentStructure(source),
      geometry: { status: "unavailable", reason: "photo_transform_missing" },
    };
  }
  const literal = options.transformedDocument ? indexLiteralDocument(options.transformedDocument).document : source;
  return {
    source: "generator_export", variant, literal, contentStructure: contentStructure(literal),
    geometry: variant === "photo_telegram"
      ? { status: "transformed", coordinateSpace: "photo-telegram-normalized" }
      : { status: "source", coordinateSpace: "generator-source-normalized" },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function metric(value: unknown, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateMetrics(value: unknown, keys: string[], geometry = false) {
  if (!isRecord(value)) return false;
  return keys.every((key) => metric(value[key], geometry && key === "geometryAccuracy"));
}

export function validateReceiptEvalRecord(value: unknown): ReceiptEvalRecord {
  if (!isRecord(value)) throw new Error("invalid_receipt_eval_record");
  const idKeys = ["fileId", "readerId", "classifierId", "requestedModelId", "returnedModelId"];
  if (!idKeys.every((key) => nonEmptyString(value[key]))) throw new Error("invalid_receipt_eval_record");
  if (!Array.isArray(value.documentIds) || value.documentIds.some((id) => !nonEmptyString(id)) || new Set(value.documentIds).size !== value.documentIds.length) {
    throw new Error("invalid_receipt_eval_record");
  }
  if (![value.runNumber, value.latencyMs, value.estimatedCostMicrousd].every(nonNegativeInteger)) throw new Error("invalid_receipt_eval_record");
  if (!validateMetrics(value.literalMetrics, ["textPrecision", "textRecall", "numericPrecision", "numericRecall", "structureAccuracy", "geometryAccuracy"], true)) {
    throw new Error("invalid_receipt_eval_record");
  }
  if (!validateMetrics(value.classificationMetrics, ["rolePrecision", "roleRecall", "slotPrecision", "slotRecall", "segmentationAccuracy"])) {
    throw new Error("invalid_receipt_eval_record");
  }
  if (!isRecord(value.documentCoverage) || !nonNegativeInteger(value.documentCoverage.expected) || !nonNegativeInteger(value.documentCoverage.produced) || !Array.isArray(value.documentCoverage.matchedDocIds)) {
    throw new Error("invalid_receipt_eval_record");
  }
  const documentIds = value.documentIds as string[];
  const coverage = value.documentCoverage as { expected: number; produced: number; matchedDocIds: unknown[] };
  const matched = value.documentCoverage.matchedDocIds;
  if (matched.some((id) => !nonEmptyString(id)) || new Set(matched).size !== matched.length || matched.some((id) => !documentIds.includes(id as string)) ||
    coverage.expected !== documentIds.length || matched.length > coverage.produced) {
    throw new Error("invalid_receipt_eval_record");
  }
  if (!["pass", "partial", "reject", "error"].includes(String(value.endToEndDecision))) throw new Error("invalid_receipt_eval_record");
  if (!["source", "transformed", "unavailable"].includes(String(value.geometryOracleStatus))) throw new Error("invalid_receipt_eval_record");
  const literalMetrics = value.literalMetrics as Record<string, unknown>;
  if (value.geometryOracleStatus === "unavailable" && literalMetrics.geometryAccuracy !== null) throw new Error("geometry_oracle_unavailable");
  if (typeof value.deterministicDecisionFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(value.deterministicDecisionFingerprint)) {
    throw new Error("invalid_decision_fingerprint");
  }
  return structuredClone(value) as ReceiptEvalRecord;
}

function canonicalEncode(value: unknown, parentKey?: string, seen = new Set<object>()): string {
  if (value === null) return "n";
  if (typeof value === "bigint") return `i${value.toString().length}:${value}`;
  if (typeof value === "string") return `s${value.length}:${value}`;
  if (typeof value === "boolean") return value ? "b1" : "b0";
  if (typeof value === "undefined") return "u";
  if (typeof value === "number") {
    const encoded = Object.is(value, -0) ? "-0" : Number.isNaN(value) ? "NaN" : String(value);
    return `f${encoded.length}:${encoded}`;
  }
  if (typeof value !== "object") return `x${String(value)}`;
  if (seen.has(value)) throw new Error("cyclic_fingerprint_input");
  seen.add(value);
  if (Array.isArray(value)) {
    const entries = parentKey === "documents" && value.every((entry) => isRecord(entry) && typeof entry.docId === "string")
      ? [...value].sort((left, right) => String((left as Record<string, unknown>).docId).localeCompare(String((right as Record<string, unknown>).docId)) || canonicalEncode(left).localeCompare(canonicalEncode(right)))
      : value;
    const encoded = `a${entries.length}:${entries.map((entry) => canonicalEncode(entry, undefined, seen)).join("")}`;
    seen.delete(value);
    return encoded;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const encoded = `o${keys.length}:${keys.map((key) => `${canonicalEncode(key)}${canonicalEncode(record[key], key, seen)}`).join("")}`;
  seen.delete(value);
  return encoded;
}

export function deterministicDecisionFingerprint(value: unknown) {
  return createHash("sha256").update(canonicalEncode(value)).digest("hex");
}
