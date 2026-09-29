import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { require as tsRequire } from "tsx/cjs/api";

const args = process.argv.slice(2);
const argument = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const series = argument("--series");
if (!series || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(series)) throw new Error("invalid_series_name");
const root = path.resolve(argument("--output-root") ?? ".receipt-spike/runs");
const runRoot = path.join(root, series);
const ledgerFile = path.join(runRoot, "spend-ledger.jsonl");
const metadataFile = path.join(runRoot, "run.meta.json");
for (const file of [ledgerFile, metadataFile]) if (!fs.lstatSync(file).isFile()) throw new Error("oracle_series_file_invalid");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const ledgerSha256 = sha256(fs.readFileSync(ledgerFile));
const metadata = readJson(metadataFile);
const fixtureRoot = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifestFile = path.join(fixtureRoot, "spike-manifest.json");
if (metadata.integrity?.manifestSha256 !== sha256(fs.readFileSync(manifestFile))) throw new Error("oracle_manifest_mismatch");
const manifest = readJson(manifestFile);
const { evaluateEndToEnd } = tsRequire("../../lib/server/receipt-spike/evaluator.ts", import.meta.url);
const results = [];
for (const [cell, classifierId] of [["oracle-literal-c1", "C1-openai-strong"], ["oracle-literal-c2", "C2-openai-economy"]]) {
  for (let runNumber = 1; runNumber <= 3; runNumber += 1) for (const file of manifest.files) {
    const classifierFile = path.join(runRoot, cell, file.fileId, "oracle_literal", `run-${runNumber}`, "classifier", "classification.json");
    if (!fs.existsSync(classifierFile)) continue;
    if (!fs.lstatSync(classifierFile).isFile()) throw new Error("oracle_classification_file_invalid");
    for (const descriptor of [file.evaluator.literal_source, file.evaluator.semantic]) {
      if (sha256(fs.readFileSync(path.join(fixtureRoot, descriptor.path))) !== descriptor.sha256) throw new Error("oracle_fixture_changed");
    }
    const evaluation = evaluateEndToEnd({
      fileId: file.fileId, variant: "oracle_literal", runNumber,
      readerId: "oracle-reader", classifierId,
      readerInput: readJson(path.join(fixtureRoot, file.evaluator.literal_source.path)),
      classifierOutput: readJson(classifierFile),
      semanticOracle: readJson(path.join(fixtureRoot, file.evaluator.semantic.path)),
    });
    results.push({ cell, evaluation });
  }
}
if (sha256(fs.readFileSync(ledgerFile)) !== ledgerSha256) throw new Error("oracle_ledger_changed_during_read");
const cells = ["oracle-literal-c1", "oracle-literal-c2"].map((cell) => {
  const evaluations = results.filter((result) => result.cell === cell).map((result) => result.evaluation);
  return {
    cell,
    evaluations: evaluations.length,
    meanMonetaryRoleAccuracy: evaluations.length
      ? evaluations.reduce((sum, item) => sum + item.classifierMetrics.monetaryRoleAccuracy, 0) / evaluations.length : null,
    silentCriticalErrors: evaluations.reduce((sum, item) => sum + item.silentCriticalErrors, 0),
    unassessableConfirmedDocuments: evaluations.reduce((sum, item) => sum + item.unassessableConfirmedDocuments, 0),
    documentAlignmentFailures: evaluations.reduce((sum, item) => sum + item.documentAlignmentFailures, 0),
    falseRejects: evaluations.reduce((sum, item) => sum + item.falseRejects, 0),
    alignmentCases: evaluations.filter((item) => item.documentAlignmentFailures ||
      item.decisions.some((decision) => decision.producedDocId !== decision.docId))
      .map((item) => ({ fileId: item.fileId, runNumber: item.runNumber, decisions: item.decisions,
        unmatchedProducedDocumentIds: item.unmatchedProducedDocumentIds })),
  };
});
process.stdout.write(`${JSON.stringify({ schemaVersion: "receipt-oracle-reevaluation-v1", series, ledgerSha256, cells }, null, 2)}\n`);
