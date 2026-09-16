import test from "node:test";
import assert from "node:assert/strict";
import replay from "./fixtures/receipt-august-2026-replay.json" with { type: "json" };
import { calculateReceipt, receiptMinor, renderReceiptCalculation, receiptExceptionAgreement } from "../lib/receipt-calculation.ts";

const amounts = ["372.77", "597.98", "226.63", "67.78", "736.36", "24.71", "50.83", "388.17", "1479.70", "819.47", "693.29", "229.00", "176.00", "7.06", "917.09", "1417.81"];
const receipt = {
  isReceipt: true, service: "ЖКХ", providerKey: "RU:INN:7841310500", documentDate: "2026-09-05",
  documentPeriod: "2026-09", requestedPeriod: "2026-08", currency: "RUB", accrued: "8204.65",
  accruedConfident: true, payable: "7616.24", credit: "588.41", debt: null, dueDate: "2026-10-10",
  lines: amounts.map((amount, index) => ({ amount, label: index === 15 ? "Пени" : index === 14 ? "Капремонт" : `Услуга ${index}`, kind: index === 15 ? "penalty" : "service" })),
  linesComplete: true, repeatedPanel: true, warnings: [],
};
const policy = { id: "apartment/provider", excludePenalties: true, periodOffset: -1, optionalIncluded: true };

test("August receipt: exact kopeks, penalties excluded, capital repair included", () => {
  const result = calculateReceipt(receipt, policy);
  assert.equal(result.rowTotalMinor, 820465);
  assert.equal(result.tenantMinor, 678684);
  assert.equal(result.tenantPeriod, "2026-08");
  assert.equal(result.exclusions.length, 1);
  assert.match(renderReceiptCalculation(result), /6\s786,84/);
  assert.equal(result.raw.documentPeriod, "2026-09");
});
test("actual JPEG replay retains all extracted rows and expected tenant result", () => {
  const result = calculateReceipt(replay.raw, policy);
  assert.equal(result.tenantMinor, 678684);
  assert.equal(result.rowTotalMinor, 820465);
  assert.equal(result.exclusions[0].minor, 141781);
  assert.equal(result.raw.lines.find((line) => line.label.startsWith("Кап.")).amount, "917.09");
  assert.equal(result.tenantPeriod, "2026-08");
});
test("supplier credit, debt and payable do not change tenant charges", () => {
  for (const patch of [{ credit: "999999.99" }, { debt: "999999.99" }, { payable: "1.00" }]) {
    assert.equal(calculateReceipt({ ...receipt, ...patch }, policy).tenantMinor, 678684);
  }
});
test("missing or uncertain accrued cannot fall back to payable", () => {
  assert.equal(calculateReceipt({ ...receipt, accrued: null }, policy).tenantMinor, null);
  assert.equal(calculateReceipt({ ...receipt, accruedConfident: false }, policy).tenantMinor, null);
});
test("duplicated panels and mismatched lines are blocked, never auto-corrected", () => {
  assert.equal(calculateReceipt({ ...receipt, lines: [...receipt.lines, ...receipt.lines] }, policy).tenantMinor, null);
  assert.equal(calculateReceipt({ ...receipt, lines: receipt.lines.slice(1) }, policy).tenantMinor, null);
});
test("unknown exclusions and conflicting period require clarification", () => {
  assert.equal(calculateReceipt(receipt, { ...policy, excludePenalties: null }).tenantMinor, null);
  assert.equal(calculateReceipt(receipt, { ...policy, periodOffset: null }).tenantMinor, null);
});
test("other providers are not shifted without a scoped rule", () => {
  const other = { ...receipt, providerKey: "another", requestedPeriod: null };
  assert.equal(calculateReceipt(other, { ...policy, periodOffset: null }).tenantPeriod, "2026-09");
});
test("two documents keep independent raw data, rows and calculations", () => {
  const second = { ...receipt, service: "Тестовый ресурс", accrued: "10.01", lines: [{ label: "Тест", amount: "10.01", kind: "service" }] };
  const firstResult = calculateReceipt(receipt, policy);
  const secondResult = calculateReceipt(second, policy);
  assert.equal(firstResult.tenantMinor, 678684);
  assert.equal(secondResult.tenantMinor, 1001);
  assert.equal(firstResult.raw.lines.length, 16);
});
test("decimal parser rejects ambiguity and avoids floating point summation", () => {
  assert.equal(receiptMinor("1417.81"), 141781);
  assert.equal(receiptMinor("8,204.65"), null);
  assert.equal(receiptMinor("1.001"), null);
  assert.equal(receiptMinor("0.10") + receiptMinor("0.20"), 30);
});
test("excluding insurance does not exclude other voluntary services", () => {
  const raw = { ...receipt, accrued: "3.00", lines: [
    { label: "Страхование", kind: "insurance", amount: "1.00" },
    { label: "Другая услуга", kind: "optional", amount: "2.00" },
  ] };
  const result = calculateReceipt(raw, { ...policy, optionalIncluded: false });
  assert.equal(result.tenantMinor, 200);
  assert.equal(result.exclusions.length, 1);
});
test("independent exception reading detects a row shift even when totals agree", () => {
  assert.equal(receiptExceptionAgreement(receipt, [{ label: "Пени", amount: "917.09", kind: "penalty" }]), false);
  assert.equal(receiptExceptionAgreement(receipt, [{ label: "Пени", amount: "1417.81", kind: "penalty" }]), true);
});
