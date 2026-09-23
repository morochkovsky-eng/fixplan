import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return nextResolve(specifier, context);
} });
await import("tsx/esm");
const money = await import("../lib/server/receipt-money.ts");
const telegram = await import("../lib/server/telegram.ts");

test("receipt money uses exact decimal-to-minor arithmetic", () => {
  assert.equal(money.moneyToMinor("14 995,84"), 1499584n);
  assert.equal(money.moneyToMinor("-256.17"), -25617n);
  assert.equal(money.minorToDecimal(521856n), "5218.56");
  assert.equal(money.calculatedProviderDue({ currentCharge: "14405.63", openingDebt: "75590.21", openingCredit: "0", paid: "75000.00" }), 1499584n);
});

test("long receipt audits split below Telegram's limit without losing content", () => {
  const text = Array.from({ length: 300 }, (_, index) => `Строка услуги ${index + 1}: 10,00 ₽`).join("\n");
  const chunks = telegram.splitTelegramText(text, 500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 500));
  assert.equal(chunks.join("\n").replace(/\s+/gu, " "), text.replace(/\s+/gu, " "));
});

test("receipt migration creates normalized child tables with owner membership RLS", () => {
  const migration = readFileSync("supabase/migrations/20260923160000_expand_utility_receipt_details.sql", "utf8");
  for (const table of ["utility_bill_line_items", "utility_bill_meter_entries", "utility_bill_optional_charges"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.equal((migration.match(/public\.is_apartment_member\(apartment_id\)/g) ?? []).length, 6);
  assert.match(migration, /on delete cascade/g);
  assert.match(migration, /utility_bills_source_fingerprint_unique/);
  assert.match(migration, /utility_bills_source_update_unique/);
});
