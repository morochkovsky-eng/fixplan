import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, nextResolve) { if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true }; return nextResolve(specifier, context); } });
await import("tsx/esm");
const { runReceiptPipeline } = await import("../lib/server/receipt-pipeline.ts");

const manifestPath = process.argv[2];
const models = String(process.env.RECEIPT_EVAL_MODELS ?? "gpt-5.5-2026-04-23").split(",").map((value) => value.trim()).filter(Boolean);
const runs = Number(process.env.RECEIPT_EVAL_RUNS ?? 3);
if (!manifestPath || !process.env.OPENAI_API_KEY || !Number.isInteger(runs) || runs < 1) {
  console.error("Usage: OPENAI_API_KEY=... RECEIPT_EVAL_MODELS=... node scripts/eval-receipt-pipeline.mjs <private-manifest.json>");
  process.exitCode = 1;
} else {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const mime = new Map([[".pdf", "application/pdf"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"]]);
  const rows = [];
  for (const [caseIndex, testCase] of manifest.cases.entries()) {
    const bytes = await readFile(testCase.path);
    const mimeType = mime.get(extname(testCase.path).toLowerCase());
    if (!mimeType) throw new Error(`Unsupported private fixture at index ${caseIndex}`);
    for (const model of models) {
      for (let run = 1; run <= runs; run += 1) {
        process.env.OPENAI_RECEIPT_TRANSCRIPTION_MODEL = model;
        process.env.OPENAI_RECEIPT_NORMALIZATION_MODEL = String(testCase.normalizationModel ?? model);
        const result = await runReceiptPipeline({ dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`, filename: `case-${caseIndex + 1}${extname(testCase.path)}`, mimeType });
        const expected = testCase.expected ?? {};
        const actual = result.receipt;
        const exact = (key) => expected[key] === undefined ? null : actual?.[key]?.value === expected[key];
        rows.push({
          case: testCase.id ?? `case-${caseIndex + 1}`,
          model,
          run,
          ok: result.ok,
          fallbackUsed: result.fallbackUsed,
          periodExact: exact("billingPeriod"),
          accruedExact: exact("accruedAmount"),
          mandatoryDueExact: exact("mandatoryDue"),
          dueDateExact: exact("dueDate"),
          lineCount: actual?.lineItems.length ?? 0,
          meterCount: actual?.meterEntries.length ?? 0,
          optionalChargeCount: actual?.optionalCharges.length ?? 0,
          reviewFieldCount: result.validation?.reviewFields.length ?? null,
          hallucinationCount: Object.entries(expected).filter(([key, value]) => value === null && actual?.[key]?.value !== null).length,
          attempts: result.attempts.map((item) => ({ stage: item.stage, provider: item.provider, model: item.model, latencyMs: item.latencyMs, inputTokens: item.inputTokens, outputTokens: item.outputTokens, failureCode: item.failureCode })),
          failureCode: result.failureCode,
        });
      }
    }
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), runs, models, results: rows }, null, 2));
}
