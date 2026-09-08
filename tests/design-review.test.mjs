import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("currency formatting preserves cents, symbol, and locale", async () => {
  const code = ts.transpile(readFileSync("lib/format-money.ts", "utf8"), { module: ts.ModuleKind.ESNext });
  const { formatMoney } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  assert.equal(formatMoney(0), "0,00\u00a0₽");
  assert.equal(formatMoney(11718.32), "11\u00a0718,32\u00a0₽");
  assert.equal(formatMoney(1.239), "1,24\u00a0₽");
  assert.match(formatMoney(12, "EUR", "es-ES"), /12,00.*€/);
});

test("review keeps workspace sizing and mobile controls explicit", () => {
  assert.match(css, /@container workspace/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /textarea:not\(\[data-slot\]\)/);
  assert.match(css, /\.money-grid/);
});

test("document forms and chat use separate library components", () => {
  assert.match(page, /<MessageResponse/);
  assert.match(page, /<CommandInput aria-label="Найти узел для документа"/);
  assert.match(page, /<InputGroupInput\s+aria-label="Поиск событий"/);
  assert.match(page, /<Dialog open=\{showBillForm\}/);
  assert.match(page, /formData.append\("files", file\)/);
  const docs = page.slice(page.indexOf('async function createDocuments()'), page.indexOf('{expiringDocuments.length > 0'));
  assert.doesNotMatch(docs, /<PromptInput/);
  assert.match(docs, /<Textarea id="document-note"/);
});
