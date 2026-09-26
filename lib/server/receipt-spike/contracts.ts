import { createHash } from "node:crypto";
import type { LiteralDocument, RoleClassification, VisualDocumentInput } from "../receipt-core";

export const RECEIPT_SPIKE_SCHEMA_VERSION = "receipt-spike-v1";
export const RECEIPT_SPIKE_ADAPTER_VERSION = "visual-adapters-v1";

export type InputVariant = "png_clean" | "photo_telegram" | "pdf_digital" | "oracle_literal";
export type ReaderId = "R1-openai-vision" | "R2-google-enterprise-ocr" | "R3-pdf-text-layer" | "oracle-reader";
export type ClassifierId = "C1-openai-strong" | "C2-openai-economy" | "oracle-classifier";

export type ProviderMetadata = {
  provider: "openai" | "google-document-ai" | "local" | "oracle";
  requestedModelId: string;
  returnedModelId: string;
  promptSha256: string;
  adapterVersion: string;
  inputSha256: string;
  latencyMs: number;
  usage: { inputTokens?: number; outputTokens?: number; pages?: number };
  costMicrousd: number;
};

export type ReaderArtifact = {
  schemaVersion: typeof RECEIPT_SPIKE_SCHEMA_VERSION;
  fileId: string;
  variant: Exclude<InputVariant, "oracle_literal">;
  runNumber: number;
  readerId: ReaderId;
  metadata: ProviderMetadata;
  rawOutputPath: string;
  visualDocument: VisualDocumentInput;
};

export type ClassifierInput = {
  schemaVersion: typeof RECEIPT_SPIKE_SCHEMA_VERSION;
  fileId: string;
  literalDocument: LiteralDocument;
};

export type ClassifierArtifact = {
  schemaVersion: typeof RECEIPT_SPIKE_SCHEMA_VERSION;
  fileId: string;
  variant: InputVariant;
  runNumber: number;
  classifierId: ClassifierId;
  metadata: ProviderMetadata;
  rawOutputPath: string;
  roleClassification: RoleClassification;
};

export type ReaderMetrics = {
  textPrecision: number;
  textRecall: number;
  textMetricGranularity: "cell" | "document_token";
  numericPrecision: number;
  numericRecall: number;
  rowColumnAccuracy: number | null;
  structureMetricStatus: "measured" | "not_applicable_reader_has_no_table_contract";
  geometryAccuracy: number | null;
  geometryMetricStatus: "measured" | "not_applicable_reader_has_no_cell_geometry_contract";
  blankCellsFilled: number | null;
  blankMetricStatus: "measured" | "not_applicable_reader_has_no_cell_contract";
  illegibleCellsFilled: number | null;
  illegibleMetricStatus: "measured" | "not_tested_no_illegible_cells" | "not_applicable_reader_has_no_cell_contract";
};

export type ClassifierMetrics = {
  rolePrecision: number;
  roleRecall: number;
  slotPrecision: number;
  slotRecall: number;
  monetaryRoleAccuracy: number;
  segmentationAccuracy: number;
};

export type SpikeEvaluation = {
  fileId: string;
  variant: InputVariant;
  runNumber: number;
  readerId: ReaderId;
  classifierId: ClassifierId;
  readerMetrics: ReaderMetrics | null;
  classifierMetrics: ClassifierMetrics;
  expectedDocumentIds: string[];
  producedDocumentIds: string[];
  decisions: Array<{
    docId: string;
    expected: string;
    actual: string | null;
    criticalFieldsMatch: boolean;
  }>;
  silentCriticalErrors: number;
  falseRejects: number;
  decisionFingerprint: string;
};

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
