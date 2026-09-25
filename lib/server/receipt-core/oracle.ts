import { createHash } from "node:crypto";
import { indexLiteralDocument } from "./literal";
import type { IndexedLiteralDocument, ReceiptEvalRecord, VisualDocumentInput } from "./types";

export type OracleGeometry =
  | { status: "source" | "transformed"; coordinateSpace: string }
  | { status: "unavailable"; reason: "photo_transform_missing" | "generator_geometry_missing" };

export type LiteralOracle = {
  source: "generator_export";
  variant: "source" | "photo_telegram";
  literal: IndexedLiteralDocument["document"];
  contentStructureAvailable: true;
  geometry: OracleGeometry;
};

export function exportGeneratorLiteral(
  generatorDocument: VisualDocumentInput,
  options: { variant?: "source" | "photo_telegram"; transformedDocument?: VisualDocumentInput } = {},
): LiteralOracle {
  const variant = options.variant ?? "source";
  const indexed = indexLiteralDocument(options.transformedDocument ?? generatorDocument);
  const geometry: OracleGeometry = variant === "source"
    ? { status: "source", coordinateSpace: "generator-source-normalized" }
    : options.transformedDocument
      ? { status: "transformed", coordinateSpace: "photo-telegram-normalized" }
      : { status: "unavailable", reason: "photo_transform_missing" };
  return { source: "generator_export", variant, literal: indexed.document, contentStructureAvailable: true, geometry };
}

export function validateReceiptEvalRecord(value: ReceiptEvalRecord): ReceiptEvalRecord {
  if (!value.fileId || !value.readerId || !value.classifierId || value.runNumber < 1 || value.latencyMs < 0 || value.estimatedCostMicrousd < 0) {
    throw new Error("invalid_receipt_eval_record");
  }
  if (!/^[a-f0-9]{64}$/u.test(value.deterministicDecisionFingerprint)) throw new Error("invalid_decision_fingerprint");
  return structuredClone(value);
}

export function deterministicDecisionFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value, (_key, entry) => typeof entry === "bigint" ? entry.toString() : entry)).digest("hex");
}
