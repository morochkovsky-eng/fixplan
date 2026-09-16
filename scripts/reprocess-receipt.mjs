import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extractReceipt } from "../lib/server/receipt-extraction.ts";
import { calculateReceipt, renderReceiptCalculation } from "../lib/receipt-calculation.ts";

// Read-only replay: no database writes, bill confirmation or Telegram delivery.
const [file, providerKey, offset, excludesPenalties] = process.argv.slice(2);
if (!file || !providerKey || offset === undefined || !["true", "false"].includes(excludesPenalties)) {
  throw new Error("Usage: reprocess-receipt.mjs FILE PROVIDER_KEY OFFSET EXCLUDE_PENALTIES");
}
const bytes = await readFile(file);
const result = await extractReceipt({
  filename: file.split("/").at(-1), mimeType: file.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
  dataUrl: `data:${file.endsWith(".pdf") ? "application/pdf" : "image/jpeg"};base64,${bytes.toString("base64")}`,
}, "Сформировать счёт жильцу за август 2026");
const calculation = calculateReceipt(result.raw, {
  id: `owner-confirmed-2026-09-11/${providerKey}`, excludePenalties: excludesPenalties === "true",
  periodOffset: result.raw.providerKey === providerKey ? Number(offset) : null, optionalIncluded: true,
});
const report = { sourceHash: createHash("sha256").update(bytes).digest("hex"), ...result, calculation };
if (process.env.RECEIPT_AUDIT_OUTPUT) await writeFile(process.env.RECEIPT_AUDIT_OUTPUT, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
console.log(renderReceiptCalculation(calculation));
if (calculation.tenantMinor === null) process.exitCode = 2;
