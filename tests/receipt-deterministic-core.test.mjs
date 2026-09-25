import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return nextResolve(specifier, context);
} });
await import("tsx/esm");
const core = await import("../lib/server/receipt-core/index.ts");

const box = { x: 0, y: 0, width: 0.9, height: 0.05 };

function document(rows, overrides = {}) {
  return {
    documentKind: "utility",
    readable: true,
    pages: [{ width: 1000, height: 1400, blocks: [{
      layout: overrides.layout ?? "kv",
      bbox: { x: 0, y: 0, width: 1, height: 1 },
      rows: rows.map((cells) => ({ cells: cells.map((cell) => ({
        text: cell.text ?? String(cell),
        state: cell.state ?? "ok",
        bbox: cell.bbox ?? box,
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan,
        isHeader: cell.isHeader,
      })) })),
    }] }],
    ...overrides,
  };
}

function rowId(index) { return `p1.b1.r${index + 1}`; }
function cellId(row, cell) { return `${rowId(row)}.c${cell + 1}`; }
function tokenId(row, cell, token = 1) { return `${cellId(row, cell)}#${token}`; }

function item(row, role, valueCell = 1, tokenCells = [], extra = {}) {
  return {
    mode: "label_value", role,
    labelCellIds: [cellId(row, 0)],
    valueCellIds: [cellId(row, valueCell)],
    numericTokenIds: tokenCells.map(([cell, token = 1]) => tokenId(row, cell, token)),
    ...extra,
  };
}

function classification(rowEntries, tableSchemas = []) {
  return {
    tableSchemas,
    rows: rowEntries.map((entry, index) => ({
      rowId: rowId(index),
      role: entry.role,
      items: entry.items ?? [],
    })),
  };
}

function evaluate(rows, rowEntries, overrides = {}) {
  const indexed = core.indexLiteralDocument(document(rows, overrides));
  const validated = core.validateRoleClassification(indexed.document, classification(rowEntries));
  return { indexed, validated, receipt: core.buildCanonicalReceipt(indexed, validated) };
}

function finish(rows, rowEntries, overrides = {}) {
  const built = evaluate(rows, rowEntries, overrides);
  return { ...built, result: core.reconcileReceipt(built.receipt) };
}

function basicFinancialRows({ accrued = "100,00", due = "100,00", dueExtra = {} } = {}) {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: accrued }], [{ text: "К оплате" }, { text: due }]];
  const roles = [
    { role: "period", items: [item(0, "period")] },
    { role: "accrued_total", items: [item(1, "accrued_total", 1, [[1]])] },
    { role: "due_candidate", items: [item(2, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded", ...dueExtra })] },
  ];
  return { rows, roles };
}

test("literal indexing assigns server IDs, preserves blank cells, hashes rows, and parses exact numeric tokens", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "Сумма" }, { text: "14 995,84" }, { text: "", state: "blank" }]]));
  const row = indexed.document.pages[0].blocks[0].rows[0];
  assert.equal(row.id, "p1.b1.r1");
  assert.equal(row.cells[1].numericTokens[0].id, "p1.b1.r1.c2#1");
  assert.equal(core.decimalToMinorExact(row.cells[1].numericTokens[0]), 1499584n);
  assert.equal(row.cells[2].state, "blank");
  assert.match(row.normalizedTextHash, /^[a-f0-9]{64}$/u);
  assert.equal(core.parseExactDecimal("-256,17").coefficient, -25617n);
});

test("runtime contracts reject unknown enums and malformed geometry", () => {
  assert.throws(() => core.indexLiteralDocument(document([[{ text: "x", state: "invented" }]])), /unsupported value/u);
  assert.throws(() => core.indexLiteralDocument(document([[{ text: "x", bbox: { x: 0.9, y: 0, width: 0.2, height: 0.1 } }]])), /exceeds page bounds/u);
  const indexed = core.indexLiteralDocument(document([[{ text: "x" }]]));
  assert.throws(() => core.validateRoleClassification(indexed.document, classification([{ role: "invented" }])), /unsupported value/u);
});

test("references must exist, stay in their row, and classify every row exactly once", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "A" }, { text: "1" }], [{ text: "B" }, { text: "2" }]]));
  const validated = core.validateRoleClassification(indexed.document, {
    tableSchemas: [],
    rows: [{ rowId: rowId(0), role: "service_charge", items: [{ ...item(0, "service_charge", 1, [[1]]), valueCellIds: [cellId(1, 1)] }] }],
  });
  assert.ok(validated.diagnostics.some((entry) => entry.code === "invalid_cell_reference"));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "row_classification_missing" && entry.rowId === rowId(1)));
});

test("one numeric token cannot belong to two entities", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "Итого" }, { text: "100,00" }]]));
  const duplicated = item(0, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" });
  const validated = core.validateRoleClassification(indexed.document, classification([{
    role: "due_candidate", items: [duplicated, { ...duplicated, role: "accrued_total" }],
  }]));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "numeric_token_already_owned"));
});

test("table schemas resolve declared columns and reject missing columns", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "Услуга" }, { text: "100,00" }]], { layout: "table" }));
  const valid = core.validateRoleClassification(indexed.document, {
    tableSchemas: [{ blockId: "p1.b1", columns: [{ key: "name", index: 0, semantic: "label" }, { key: "amount", index: 1, semantic: "amount" }] }],
    rows: [{ rowId: rowId(0), role: "service_charge", items: [{ mode: "table_columns", role: "service_charge", tableBlockId: "p1.b1", labelColumnKey: "name", valueColumnKeys: ["amount"], numericTokenIds: [tokenId(0, 1)] }] }],
  });
  assert.equal(valid.items.length, 1);
  const invalid = core.validateRoleClassification(indexed.document, {
    tableSchemas: [{ blockId: "p1.b1", columns: [{ key: "name", index: 0, semantic: "label" }] }],
    rows: [{ rowId: rowId(0), role: "service_charge", items: [{ mode: "table_columns", role: "service_charge", tableBlockId: "p1.b1", valueColumnKeys: ["missing"], numericTokenIds: [] }] }],
  });
  assert.ok(invalid.diagnostics.some((entry) => entry.code === "unknown_table_column"));
});

test("printed, printed blank, absent, illegible, and not applicable remain distinct", () => {
  const rows = [
    [{ text: "Период" }, { text: "Август 2031" }],
    [{ text: "Срок" }, { text: "", state: "blank" }],
    [{ text: "Срок" }, { text: "?", state: "illegible" }],
    [{ text: "Срок" }, { text: "", state: "blank" }],
  ];
  const printed = evaluate(rows.slice(0, 2), [
    { role: "period", items: [item(0, "period")] },
    { role: "due_date", items: [item(1, "due_date")] },
  ]).receipt;
  assert.equal(printed.period.state, "printed");
  assert.equal(printed.dueDate.state, "printed_blank");
  const illegible = evaluate([rows[2]], [{ role: "due_date", items: [item(0, "due_date")] }]).receipt;
  assert.equal(illegible.dueDate.state, "illegible");
  assert.equal(illegible.period.state, "absent");
  const na = evaluate([rows[3]], [{ role: "due_date", items: [item(0, "due_date", 1, [], { declaredState: "not_applicable" })] }]).receipt;
  assert.equal(na.dueDate.state, "not_applicable");
});

test("T03-like advance uses a fixed negative role without changing the printed sign", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Аванс" }, { text: "20,00" }], [{ text: "К оплате" }, { text: "80,00" }]];
  const roles = [
    { role: "period", items: [item(0, "period")] }, { role: "accrued_total", items: [item(1, "accrued_total", 1, [[1]])] },
    { role: "opening_advance", items: [item(2, "opening_advance", 1, [[1]])] },
    { role: "due_candidate", items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  assert.equal(result.receipt.financialComponents.find((entry) => entry.role === "opening_advance").amountMinor, -2000n);
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "closed");
  assert.equal(result.mandatoryDue.status, "confirmed");
});

test("T04-like printed overpayment remains an advance and closes deterministically", () => {
  const rows = [[{ text: "Период" }, { text: "Май 2032" }], [{ text: "Начислено" }, { text: "75,00" }], [{ text: "Переплата" }, { text: "-25,00" }], [{ text: "Итого" }, { text: "50,00" }]];
  const roles = [
    { role: "period", items: [item(0, "period")] }, { role: "accrued_total", items: [item(1, "accrued_total", 1, [[1]])] },
    { role: "opening_advance", items: [item(2, "opening_advance", 1, [[1]])] },
    { role: "due_candidate", items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  assert.equal(finish(rows, roles).result.mandatoryDue.valueMinor, 5000n);
});

test("T08-like debt, current payment, and adjustments already in accrual keep separate roles", () => {
  const rows = [
    [{ text: "Период" }, { text: "Май 2033" }], [{ text: "Начислено" }, { text: "14 000,00" }],
    [{ text: "Входящий долг" }, { text: "75 000,00" }], [{ text: "Оплачено" }, { text: "74 000,00" }],
    [{ text: "Перерасчёт" }, { text: "-200,00" }], [{ text: "Пени" }, { text: "50,00" }],
    [{ text: "К оплате" }, { text: "15 000,00" }],
  ];
  const roles = [
    { role: "period", items: [item(0, "period")] }, { role: "accrued_total", items: [item(1, "accrued_total", 1, [[1]])] },
    { role: "opening_debt", items: [item(2, "opening_debt", 1, [[1]])] }, { role: "payment", items: [item(3, "payment", 1, [[1]])] },
    { role: "recalculation", items: [item(4, "recalculation", 1, [[1]], { affectsDue: "already_in_accrual" })] },
    { role: "penalty", items: [item(5, "penalty", 1, [[1]], { affectsDue: "already_in_accrual" })] },
    { role: "due_candidate", items: [item(6, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  assert.equal(result.computedDue, 1500000n);
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "closed");
  assert.deepEqual(result.receipt.financialComponents.map((entry) => entry.role), ["accrued_total", "opening_debt", "payment", "recalculation", "penalty"]);
});

test("zero and negative printed due values are valid", () => {
  const zero = basicFinancialRows({ accrued: "0,00", due: "0,00" });
  assert.equal(finish(zero.rows, zero.roles).result.mandatoryDue.valueMinor, 0n);
  const negativeRows = [[{ text: "Период" }, { text: "Июнь 2031" }], [{ text: "Начислено" }, { text: "50,00" }], [{ text: "Аванс" }, { text: "100,00" }], [{ text: "Остаток" }, { text: "-50,00" }]];
  const negativeRoles = [
    { role: "period", items: [item(0, "period")] }, { role: "accrued_total", items: [item(1, "accrued_total", 1, [[1]])] },
    { role: "opening_advance", items: [item(2, "opening_advance", 1, [[1]])] },
    { role: "due_candidate", items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  assert.equal(finish(negativeRows, negativeRoles).result.mandatoryDue.valueMinor, -5000n);
});

test("optional-inclusive and optional-exclusive printed candidates remain separate and require review", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Страховка" }, { text: "25,00" }], [{ text: "Обязательно" }, { text: "100,00" }], [{ text: "Всего" }, { text: "125,00" }]];
  const roles = [
    { role: "period", items: [item(0, "period")] }, { role: "accrued_total", items: [item(1, "accrued_total", 1, [[1]])] },
    { role: "optional_charge", items: [item(2, "optional_charge", 1, [[1]])] },
    { role: "due_candidate", items: [item(3, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
    { role: "due_candidate", items: [item(4, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "included" })] },
  ];
  const { result } = finish(rows, roles);
  assert.equal(result.receipt.dueCandidates.length, 2);
  assert.equal(result.mandatoryDue.status, "needs_review");
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "ambiguous");
});

test("a sole optional-inclusive total yields only a reviewable computed exclusion", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Добровольно" }, { text: "25,00" }], [{ text: "Всего" }, { text: "125,00" }]];
  const roles = [
    { role: "period", items: [item(0, "period")] }, { role: "accrued_total", items: [item(1, "accrued_total", 1, [[1]])] },
    { role: "optional_charge", items: [item(2, "optional_charge", 1, [[1]])] },
    { role: "due_candidate", items: [item(3, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "included" })] },
  ];
  const { result } = finish(rows, roles);
  assert.deepEqual(result.mandatoryDue, { status: "needs_review", valueMinor: 10000n, source: "computed_excluding_optional", reasons: ["only_optional_inclusive_total_printed"] });
  assert.equal(result.draft.includeInMonthlyTotal, false);
});

test("the same printed amount is deduplicated while all source IDs remain", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "К оплате" }, { text: "100,00" }], [{ text: "Итого" }, { text: "100,00" }]];
  const roles = [
    { role: "period", items: [item(0, "period")] }, { role: "accrued_total", items: [item(1, "accrued_total", 1, [[1]])] },
    { role: "due_candidate", items: [item(2, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
    { role: "due_candidate", items: [item(3, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
  ];
  const candidate = finish(rows, roles).result.receipt.dueCandidates[0];
  assert.equal(candidate.amountMinor, 10000n);
  assert.deepEqual(candidate.sourceTokenIds, [tokenId(2, 1), tokenId(3, 1)]);
});

test("blank meter reading differs from printed zero and a normative row creates no meter", () => {
  const rows = [[{ text: "Счётчик A" }, { text: "", state: "blank" }], [{ text: "Счётчик B" }, { text: "0" }], [{ text: "Норматив" }, { text: "4,2" }]];
  const roles = [
    { role: "meter_reading", items: [item(0, "meter_reading")] },
    { role: "meter_reading", items: [item(1, "meter_reading", 1, [[1]])] },
    { role: "normative_reference", items: [item(2, "normative_reference", 1, [[1]])] },
  ];
  const receipt = evaluate(rows, roles).receipt;
  assert.equal(receipt.meters.length, 2);
  assert.equal(receipt.meters[0].state, "printed_blank");
  assert.equal(receipt.meters[0].reading, null);
  assert.equal(receipt.meters[1].reading.coefficient, 0n);
});

test("financial and subtotal rows do not become service charges or double-count E1", () => {
  const rows = [[{ text: "Начислено" }, { text: "100,00" }], [{ text: "Услуга" }, { text: "100,00" }], [{ text: "Промежуточный итог" }, { text: "100,00" }], [{ text: "Долг" }, { text: "20,00" }]];
  const roles = [
    { role: "accrued_total", items: [item(0, "accrued_total", 1, [[1]])] },
    { role: "service_charge", items: [item(1, "service_charge", 1, [[1]])] },
    { role: "subtotal", items: [item(2, "subtotal", 1, [[1]])] },
    { role: "opening_debt", items: [item(3, "opening_debt", 1, [[1]])] },
  ];
  const result = core.reconcileReceipt(evaluate(rows, roles).receipt);
  assert.equal(result.receipt.serviceLines.length, 2);
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E1").status, "closed");
});

test("several closing interpretations are ambiguous and an open formula stays open", () => {
  const ambiguous = basicFinancialRows({ dueExtra: { dueScope: "unknown" } });
  assert.equal(finish(ambiguous.rows, ambiguous.roles).result.reconciliations.find((entry) => entry.equation === "E2").status, "ambiguous");
  const open = basicFinancialRows({ due: "120,00" });
  assert.equal(finish(open.rows, open.roles).result.reconciliations.find((entry) => entry.equation === "E2").status, "open");
});

test("missing components produce insufficient rather than a guessed equation", () => {
  const receipt = evaluate([[{ text: "Период" }, { text: "Август 2031" }]], [{ role: "period", items: [item(0, "period")] }]).receipt;
  const result = core.reconcileReceipt(receipt);
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "insufficient");
  assert.equal(result.draft.decision, "partial_draft");
});

test("bad table spans mark only the affected row for review", () => {
  const indexed = core.indexLiteralDocument(document([
    [{ text: "Услуга A" }, { text: "100,00" }],
    [{ text: "Услуга B", colSpan: 1 }],
  ], { layout: "table" }));
  assert.ok(indexed.diagnostics.some((entry) => entry.code === "invalid_span" && entry.rowId === rowId(1)));
  assert.equal(indexed.document.pages[0].blocks[0].rows.length, 2);
  const validated = core.validateRoleClassification(indexed.document, classification([
    { role: "service_charge", items: [item(0, "service_charge", 1, [[1]])] },
    { role: "service_charge", items: [item(1, "service_charge", 0, [])] },
  ]));
  const receipt = core.buildCanonicalReceipt(indexed, validated);
  assert.equal(receipt.serviceLines.length, 1);

  const overflowing = core.indexLiteralDocument(document([
    [{ text: "Заголовок", rowSpan: 2 }, { text: "Сумма" }],
  ], { layout: "table" }));
  assert.ok(overflowing.diagnostics.some((entry) => entry.code === "invalid_span" && entry.rowId === rowId(0)));
});

test("unknown rows remain in safe diagnostics", () => {
  const { result } = finish([[{ text: "Непонятная справочная строка" }]], [{ role: "unknown" }]);
  assert.deepEqual(result.receipt.unknownRowIds, [rowId(0)]);
  assert.equal(core.safeReceiptDiagnostic(result).counts.unknownRows, 1);
  assert.doesNotMatch(JSON.stringify(core.safeReceiptDiagnostic(result)), /Непонятная/u);
});

test("E3 warns without replacing the printed line amount", () => {
  const rows = [[{ text: "Начислено" }, { text: "70,00" }], [{ text: "Услуга" }, { text: "3" }, { text: "20,00" }, { text: "70,00" }]];
  const roles = [
    { role: "accrued_total", items: [item(0, "accrued_total", 1, [[1]])] },
    { role: "service_charge", items: [{
      ...item(1, "service_charge", 3, [[1], [2], [3]]),
      valueCellIds: [cellId(1, 1), cellId(1, 2), cellId(1, 3)],
    }] },
  ];
  const { result } = finish(rows, roles);
  const line = result.receipt.serviceLines[0];
  assert.equal(line.amountMinor, 7000n);
  const check = result.reconciliations.find((entry) => entry.equation === "E3");
  assert.equal(check.status, "open");
  assert.equal(check.actualMinor, 6000n);
  assert.equal(line.amountMinor, 7000n);
});

test("printed and computed due never overwrite each other", () => {
  const scenario = basicFinancialRows();
  const { result } = finish(scenario.rows, scenario.roles);
  assert.equal(result.receipt.dueCandidates[0].amountMinor, 10000n);
  assert.equal(result.computedDue, 10000n);
  assert.equal(result.mandatoryDue.source, "printed");
});

test("partial draft rejects only the three specified hard failures", () => {
  const periodOnly = finish([[{ text: "Период" }, { text: "Август 2031" }]], [{ role: "period", items: [item(0, "period")] }]).result;
  assert.equal(periodOnly.draft.decision, "partial_draft");
  const noPeriodOrAmount = finish([[{ text: "Поставщик" }, { text: "Вымышленный" }]], [{ role: "provider", items: [item(0, "provider")] }]).result;
  assert.equal(noPeriodOrAmount.draft.decision, "reject");
  const unreadable = finish([[{ text: "Период" }, { text: "Август 2031" }]], [{ role: "period", items: [item(0, "period")] }], { readable: false }).result;
  assert.equal(unreadable.draft.decision, "reject");
  const other = finish([[{ text: "Период" }, { text: "Август 2031" }]], [{ role: "period", items: [item(0, "period")] }], { documentKind: "other" }).result;
  assert.equal(other.draft.decision, "reject");
});
