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
const rawFile = path.join(runRoot, "r1-reader-clean-photo", "S01", "png_clean", "run-1", "reader", "response.raw.json");
for (const file of [ledgerFile, metadataFile, rawFile]) if (!fs.lstatSync(file).isFile()) throw new Error("reader_replay_file_invalid");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const ledgerSha256 = sha256(fs.readFileSync(ledgerFile));
const metadata = readJson(metadataFile);
const fixtureRoot = path.resolve("tests/fixtures/receipt-synthetic-v1.1");
const manifestFile = path.join(fixtureRoot, "spike-manifest.json");
if (metadata.series !== series || metadata.integrity?.manifestSha256 !== sha256(fs.readFileSync(manifestFile))) throw new Error("reader_replay_manifest_mismatch");
const manifest = readJson(manifestFile);
const file = manifest.files.find((item) => item.fileId === "S01");
if (!file) throw new Error("reader_replay_fixture_missing");
const oracleFile = path.join(fixtureRoot, file.evaluator.literal_source.path);
if (sha256(fs.readFileSync(oracleFile)) !== file.evaluator.literal_source.sha256) throw new Error("reader_replay_oracle_changed");
const callId = "r1-reader-clean-photo:S01:png_clean:1:reader";
const ledgerEntries = fs.readFileSync(ledgerFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
if (!ledgerEntries.some((entry) => entry.type === "completed" && entry.callId === callId)) throw new Error("reader_replay_call_not_completed");
const { parseVisionReaderOutput } = tsRequire("../../lib/server/receipt-spike/adapters.ts", import.meta.url);
const { evaluateReader, readerEvaluationProfile } = tsRequire("../../lib/server/receipt-spike/evaluator.ts", import.meta.url);
try {
  const raw = readJson(rawFile);
  const text = typeof raw.output_text === "string" ? raw.output_text :
    (Array.isArray(raw.output) ? raw.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .flatMap((content) => content?.type === "output_text" && typeof content.text === "string" ? [content.text] : []).join("") : "");
  if (!text) throw new Error("reader_replay_output_text_missing");
  const visual = parseVisionReaderOutput(JSON.parse(text));
  const metrics = evaluateReader(readJson(oracleFile), visual, readerEvaluationProfile("R1-openai-vision"));
  process.stdout.write(`${JSON.stringify({ schemaVersion: "receipt-r1-replay-v1", series, fileId: "S01", variant: "png_clean", runNumber: 1,
    contract: "valid", ledgerSha256, rawSha256: sha256(fs.readFileSync(rawFile)), metrics }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: "receipt-r1-replay-v1", series, fileId: "S01", variant: "png_clean", runNumber: 1,
    contract: "invalid", ledgerSha256, code: typeof error?.code === "string" ? error.code : "reader_replay_failed",
    message: typeof error?.code === "string" ? error.message : null }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  if (sha256(fs.readFileSync(ledgerFile)) !== ledgerSha256) {
    process.stderr.write("reader_replay_ledger_changed_during_read\n");
    process.exitCode = 1;
  }
}
