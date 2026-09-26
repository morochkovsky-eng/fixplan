import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const upstream = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const archiveSha256 = "2a1e28f08e477671a0e85c7e9dd0a1ca24b4712d255d8ccef6a09fd324b2e127";

function sha(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function entry(relativePath, visibility) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`manifest_input_missing:${relativePath}`);
  return { path: relativePath, sha256: sha(absolute), bytes: fs.statSync(absolute).size, visibility };
}

const files = upstream.files.map((file) => {
  const id = file.logicalFileId;
  const clean = entry(file.clean.png, "reader_only");
  const photo = entry(file.photo_telegram.jpg, "reader_only");
  if (clean.sha256 !== file.clean.sha256 || photo.sha256 !== file.photo_telegram.sha256) throw new Error(`upstream_sha_mismatch:${id}`);
  return {
    fileId: id,
    documentIds: file.documents.map((document) => document.docId),
    inputs: {
      png_clean: { ...clean, width: file.clean.size[0], height: file.clean.size[1] },
      photo_telegram: { ...photo, width: file.photo_telegram.size[0], height: file.photo_telegram.size[1] },
      pdf_digital: entry(`pdf_digital/${id}.pdf`, "r3_only"),
      html_source: entry(file.clean.html, "generator_only"),
    },
    evaluator: {
      literal_source: entry(file.oracle.literalSource, "evaluator_only"),
      literal_photo: entry(file.oracle.literalPhoto, "evaluator_only"),
      geometry_photo: entry(file.oracle.geometryPhoto, "evaluator_only"),
      semantic: entry(file.oracle.semantic, "evaluator_only"),
    },
  };
});

const repoRoot = path.resolve(".");
const prompt = (relativePath) => ({ path: relativePath, sha256: sha(path.join(repoRoot, relativePath)) });
const manifest = {
  schemaVersion: "receipt-spike-manifest-v1",
  baselineCommit: "1bc6309a4312631e5ba99084c65fddd86f4e2266",
  sourcePackage: { name: "homory-synthetic-v1.1-rev2.zip", sha256: archiveSha256 },
  decisionSource: "oracle/semantic",
  legacyGoldUsed: false,
  documentCount: files.reduce((sum, file) => sum + file.documentIds.length, 0),
  inputFileCount: 20,
  pdfToolchain: { playwright: "1.56.0", chromium: "141.0.7390.37", pdfLib: "1.17.1" },
  adapters: {
    version: "visual-adapters-v1",
    source: { path: "lib/server/receipt-spike/adapters.ts", sha256: sha(path.join(repoRoot, "lib/server/receipt-spike/adapters.ts")) },
  },
  prompts: {
    reader: prompt("prompts/receipt-spike/reader-v1.md"),
    classifier: prompt("prompts/receipt-spike/classifier-v1.md"),
  },
  models: {
    R1: { provider: "openai", requestedModelId: "gpt-6-sol", imageDetail: "original" },
    R2: {
      provider: "google-document-ai",
      processorType: "OCR_PROCESSOR",
      requestedVersion: "pretrained-ocr-v2.1-2024-08-07",
      capability: "text_and_line_geometry_without_guaranteed_table_semantics",
      textMetricGranularity: "document_token",
      structureMetricStatus: "not_applicable_reader_has_no_table_contract",
      geometryMetricStatus: "not_applicable_reader_has_no_cell_geometry_contract",
    },
    R3: { provider: "local", adapter: "pdfjs-dist@6.3.289" },
    C1: { provider: "openai", requestedModelId: "gpt-6-sol", reasoningEffort: "low" },
    C2: { provider: "openai", requestedModelId: "gpt-6-luna", reasoningEffort: "medium" },
  },
  files,
};

const output = path.join(root, "spike-manifest.json");
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output: path.relative(process.cwd(), output), files: files.length, documents: manifest.documentCount, verifiedInputs: 20 })}\n`);
