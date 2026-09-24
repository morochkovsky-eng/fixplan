import { appendFile, readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, nextResolve) { if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true }; return nextResolve(specifier, context); } });
await import("tsx/esm");
const { runReceiptPipeline } = await import("../lib/server/receipt-pipeline.ts");

const manifestPath = process.argv[2];
const models = String(process.env.RECEIPT_EVAL_MODELS ?? "gpt-5.5-2026-04-23").split(",").map((value) => value.trim()).filter(Boolean);
const runs = Number(process.env.RECEIPT_EVAL_RUNS ?? 3);
const outputPath = process.env.RECEIPT_EVAL_OUTPUT?.trim() || null;
if (!manifestPath || !process.env.OPENAI_API_KEY || !Number.isInteger(runs) || runs < 1) {
  console.error("Usage: OPENAI_API_KEY=... RECEIPT_EVAL_MODELS=... node scripts/eval-receipt-pipeline.mjs <private-manifest.json>");
  process.exitCode = 1;
} else {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (outputPath) await writeFile(outputPath, "", { mode: 0o600 });
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
        const expectedLineAmounts = Array.isArray(expected.lineAmounts) ? expected.lineAmounts : [];
        const actualLineAmounts = (actual?.lineItems ?? [])
          .filter((line) => line.rowKind === "charge")
          .map((line) => line.totalAmount.value ?? line.chargeAmount.value)
          .filter((value) => Number.isInteger(value));
        const remainingLineAmounts = [...actualLineAmounts];
        const matchingLineAmounts = expectedLineAmounts.reduce((count, value) => {
          const index = remainingLineAmounts.indexOf(value);
          if (index < 0) return count;
          remainingLineAmounts.splice(index, 1);
          return count + 1;
        }, 0);
        const expectedMeterCount = Number.isInteger(expected.meterCount) ? expected.meterCount : null;
        const currentMeterValues = (actual?.meterEntries ?? []).map((meter) => meter.currentValue.value);
        const expectedOptionalAmounts = Array.isArray(expected.optionalChargeAmounts) ? expected.optionalChargeAmounts : [];
        const actualOptionalAmounts = (actual?.optionalCharges ?? []).map((charge) => charge.amount.value).filter((value) => Number.isInteger(value));
        const remainingOptionalAmounts = [...actualOptionalAmounts];
        const matchingOptionalAmounts = expectedOptionalAmounts.reduce((count, value) => {
          const index = remainingOptionalAmounts.indexOf(value);
          if (index < 0) return count;
          remainingOptionalAmounts.splice(index, 1);
          return count + 1;
        }, 0);
        const providerTerms = Array.isArray(expected.providerIncludes) ? expected.providerIncludes.map((value) => String(value).toLocaleLowerCase("ru")) : [];
        const normalizedProvider = String(actual?.provider.value ?? "").toLocaleLowerCase("ru");
        const nullExpectedScalarKeys = [
          "billingPeriod", "issuedDate", "dueDate", "accruedAmount", "openingDebt", "openingAdvance",
          "paymentsAppliedToCurrentPeriod", "recalculationAmount", "benefitAmount", "penaltyAmount",
          "printedMandatoryDue", "mandatoryDue",
        ];
        const unexpectedScalarValues = nullExpectedScalarKeys.filter(
          (key) => expected[key] === null && actual?.[key]?.value !== null,
        ).length;
        const unexpectedLastPaymentValues = [
          expected.lastPaymentAmount === null && actual?.lastPayment.amount.value !== null,
          expected.lastPaymentDate === null && actual?.lastPayment.date.value !== null,
        ].filter(Boolean).length;
        const row = {
          case: testCase.id ?? `case-${caseIndex + 1}`,
          model,
          run,
          ok: result.ok,
          fallbackUsed: result.fallbackUsed,
          periodExact: exact("billingPeriod"),
          accruedExact: exact("accruedAmount"),
          mandatoryDueExact: exact("mandatoryDue"),
          dueDateExact: exact("dueDate"),
          documentTypeExact: exact("documentType"),
          openingDebtExact: exact("openingDebt"),
          openingAdvanceExact: exact("openingAdvance"),
          currentPaymentsExact: exact("paymentsAppliedToCurrentPeriod"),
          recalculationExact: exact("recalculationAmount"),
          penaltyExact: exact("penaltyAmount"),
          printedMandatoryDueExact: exact("printedMandatoryDue"),
          lastPaymentAmountExact: expected.lastPaymentAmount === undefined ? null : actual?.lastPayment.amount.value === expected.lastPaymentAmount,
          lastPaymentDateExact: expected.lastPaymentDate === undefined ? null : actual?.lastPayment.date.value === expected.lastPaymentDate,
          providerExact: providerTerms.length ? providerTerms.every((term) => normalizedProvider.includes(term)) : null,
          actualCritical: actual ? {
            documentType: actual.documentType.value,
            billingPeriod: actual.billingPeriod.value,
            accruedAmount: actual.accruedAmount.value,
            openingDebt: actual.openingDebt.value,
            openingAdvance: actual.openingAdvance.value,
            paymentsAppliedToCurrentPeriod: actual.paymentsAppliedToCurrentPeriod.value,
            lastPaymentAmount: actual.lastPayment.amount.value,
            lastPaymentDate: actual.lastPayment.date.value,
            recalculationAmount: actual.recalculationAmount.value,
            penaltyAmount: actual.penaltyAmount.value,
            printedMandatoryDue: actual.printedMandatoryDue.value,
            mandatoryDue: actual.mandatoryDue.value,
            dueDate: actual.dueDate.value,
          } : null,
          lineCount: actualLineAmounts.length,
          totalStructuredLineCount: actual?.lineItems.length ?? 0,
          expectedLineCount: Number.isInteger(expected.lineCount) ? expected.lineCount : null,
          matchingLineAmounts,
          expectedLineAmountCount: expectedLineAmounts.length,
          unexpectedLineAmountCount: remainingLineAmounts.length,
          meterCount: actual?.meterEntries.length ?? 0,
          expectedMeterCount,
          meterCountExact: expectedMeterCount === null ? null : actual?.meterEntries.length === expectedMeterCount,
          nonBlankCurrentMeterCount: currentMeterValues.filter((value) => value !== null).length,
          blankCurrentMetersExact: expected.blankCurrentMeters !== true ? null : currentMeterValues.length === expectedMeterCount && currentMeterValues.every((value) => value === null),
          optionalChargeCount: actual?.optionalCharges.length ?? 0,
          matchingOptionalAmounts,
          expectedOptionalAmountCount: expectedOptionalAmounts.length,
          unexpectedOptionalAmountCount: remainingOptionalAmounts.length,
          reviewFieldCount: result.validation?.reviewFields.length ?? null,
          hallucinationCount: unexpectedScalarValues + unexpectedLastPaymentValues + remainingLineAmounts.length + remainingOptionalAmounts.length + Math.max(0, (actual?.meterEntries.length ?? 0) - (expectedMeterCount ?? 0)),
          attempts: result.attempts.map((item) => ({ stage: item.stage, provider: item.provider, model: item.model, latencyMs: item.latencyMs, inputTokens: item.inputTokens, outputTokens: item.outputTokens, failureCode: item.failureCode })),
          failureCode: result.failureCode,
        };
        rows.push(row);
        if (outputPath) await appendFile(outputPath, `${JSON.stringify(row)}\n`, { mode: 0o600 });
      }
    }
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), runs, models, results: rows }, null, 2));
}
