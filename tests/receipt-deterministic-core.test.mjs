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
const ROLE_SLOT = {
  service_charge: "charge", subtotal: "row_total", optional_charge: "optional_charge",
  accrued_total: "accrued_total", opening_balance: "opening_balance", opening_debt: "opening_debt",
  opening_advance: "opening_advance", payment: "payment", benefit: "benefit", recalculation: "recalculation",
  penalty: "penalty", rounding: "rounding", closing_balance: "closing_balance", closing_debt: "closing_debt",
  closing_advance: "closing_advance", due_candidate: "due_candidate", payment_history: "payment_history",
  meter_reading: "meter_curr", normative_reference: "normative", provider: "provider", account: "account",
  address: "address", period: "period", billing_period: "billing_period", issue_date: "issue_date", due_date: "due_date",
};

function document(rows, overrides = {}) {
  return {
    readable: true,
    pages: [{ width: 1000, height: 1400, blocks: [{
      layout: overrides.layout ?? "kv",
      bbox: { x: 0, y: 0, width: 1, height: 1 },
      rows: rows.map((cells) => ({ cells: cells.map((cell) => ({
        text: cell.text ?? String(cell), state: cell.state ?? "ok", bbox: cell.bbox ?? box,
        colSpan: cell.colSpan, rowSpan: cell.rowSpan, isHeader: cell.isHeader,
      })) })),
    }] }],
    ...overrides,
  };
}

function rowId(index) { return `p1.b1.r${index + 1}`; }
function cellId(row, cell) { return `${rowId(row)}.c${cell + 1}`; }
function tokenId(row, cell, token = 1) { return `${cellId(row, cell)}#${token}`; }
function binding(row, cells, tokenCells) {
  return {
    cellIds: cells.map((cell) => cellId(row, cell)),
    ...(tokenCells === undefined ? {} : { tokenIds: tokenCells.map(([cell, token = 1]) => tokenId(row, cell, token)) }),
  };
}

function item(row, role, valueCell = 1, tokenCells = [], extra = {}) {
  const valueSlot = ROLE_SLOT[role];
  const slots = {
    label: binding(row, [0], []),
    ...(valueSlot ? { [valueSlot]: binding(row, [valueCell], tokenCells) } : {}),
    ...(extra.slots ?? {}),
  };
  const rest = Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "slots"));
  return { mode: "label_value", role, slots, ...rest };
}

function classification(rowEntries, tableSchemas = [], documentKind = "utility") {
  const rows = rowEntries.map((entry, index) => ({
    rowId: entry.rowId ?? rowId(index),
    items: entry.items ?? [item(index, entry.role, 0, [])],
  }));
  return {
    documents: [{ docId: "doc-1", documentKind, rowIds: rows.map((row) => row.rowId) }],
    sharedRowIds: [],
    tableSchemas,
    rows,
  };
}

function evaluate(rows, rowEntries, overrides = {}, documentKind = "utility", tableSchemas = []) {
  const indexed = core.indexLiteralDocument(document(rows, overrides));
  const validated = core.validateRoleClassification(indexed.document, classification(rowEntries, tableSchemas, documentKind));
  return { indexed, validated, receipt: core.buildCanonicalReceipt(indexed, validated.documents[0]) };
}

function finish(rows, rowEntries, overrides = {}, documentKind = "utility", tableSchemas = []) {
  const built = evaluate(rows, rowEntries, overrides, documentKind, tableSchemas);
  return { ...built, result: core.reconcileReceipt(built.receipt) };
}

function basicFinancialRows({ accrued = "100,00", due = "100,00", dueExtra = {} } = {}) {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: accrued }], [{ text: "К оплате" }, { text: due }]];
  const roles = [
    { items: [item(0, "period")] },
    { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded", ...dueExtra })] },
  ];
  return { rows, roles };
}

test("literal layer assigns IDs and signs but does not classify document kind", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "Сумма" }, { text: "+14 995,84" }, { text: "", state: "blank" }]]));
  const row = indexed.document.pages[0].blocks[0].rows[0];
  assert.equal(row.id, "p1.b1.r1");
  assert.equal(row.cells[1].numericTokens[0].printedSign, "plus");
  assert.equal(core.decimalToMinorExact(row.cells[1].numericTokens[0]), 1499584n);
  assert.equal(row.cells[2].state, "blank");
  assert.match(row.normalizedTextHash, /^[a-f0-9]{64}$/u);
  assert.equal("documentKind" in indexed.document, false);
  assert.equal(core.parseExactDecimal("-256,17").printedSign, "minus");
});

test("runtime contracts reject unknown enums, row-level roles, and malformed geometry", () => {
  assert.throws(() => core.indexLiteralDocument(document([[{ text: "x", state: "invented" }]])), /unsupported value/u);
  assert.throws(() => core.indexLiteralDocument(document([[{ text: "x", bbox: { x: 0.9, y: 0, width: 0.2, height: 0.1 } }]])), /exceeds page bounds/u);
  const semanticReaderOutput = document([[{ text: "1.234" }]]);
  semanticReaderOutput.pages[0].blocks[0].rows[0].cells[0].numericContext = "dot_thousands";
  assert.throws(() => core.indexLiteralDocument(semanticReaderOutput), /numericContext is not part of the literal contract/u);
  const indexed = core.indexLiteralDocument(document([[{ text: "x" }]]));
  const invalidKind = classification([{ role: "unknown" }]);
  invalidKind.documents[0].documentKind = "invented";
  assert.throws(() => core.validateRoleClassification(indexed.document, invalidKind), /unsupported value/u);
  assert.throws(() => core.validateRoleClassification(indexed.document, { documents: [{ docId: "doc-1", documentKind: "utility", rowIds: [rowId(0)] }], sharedRowIds: [], tableSchemas: [], rows: [{ rowId: rowId(0), role: "unknown", items: [] }] }), /not part of the contract/u);
});

test("references stay in their row and every row is classified once", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "A" }, { text: "1" }], [{ text: "B" }, { text: "2" }]]));
  const crossRow = item(0, "service_charge", 1, [[1]]);
  crossRow.slots.charge.cellIds = [cellId(1, 1)];
  const validated = core.validateRoleClassification(indexed.document, { documents: [{ docId: "doc-1", documentKind: "utility", rowIds: [rowId(0), rowId(1)] }], sharedRowIds: [], tableSchemas: [], rows: [{ rowId: rowId(0), items: [crossRow] }] });
  assert.ok(validated.diagnostics.some((entry) => entry.code === "invalid_cell_reference"));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "row_classification_missing" && entry.rowId === rowId(1)));
});

test("duplicate token ownership rejects all conflicting valid rows", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "Итого" }, { text: "100,00" }]]));
  const first = item(0, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" });
  const second = item(0, "accrued_total", 1, [[1]]);
  const validated = core.validateRoleClassification(indexed.document, classification([{ items: [first, second] }]));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "numeric_token_already_owned"));
  assert.equal(validated.documents[0].items.length, 0);
});

test("invalid rows do not reserve tokens and classification order cannot choose a winner", () => {
  const rows = [[{ text: "Сумма" }, { text: "100,00" }], [{ text: "Другой итог" }, { text: "200,00" }]];
  const indexed = core.indexLiteralDocument(document(rows));
  const invalid = item(0, "service_charge", 1, [[1]]);
  invalid.slots.normative = binding(0, [1], [[1]]);
  const valid = item(0, "accrued_total", 1, [[1]]);
  const other = item(1, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" });
  const forward = core.validateRoleClassification(indexed.document, classification([{ items: [invalid, valid] }, { items: [other] }]));
  const reversed = core.validateRoleClassification(indexed.document, classification([{ items: [valid, invalid] }, { items: [other] }]));
  assert.deepEqual(forward.documents[0].items.map((entry) => entry.role), ["due_candidate"]);
  assert.deepEqual(reversed.documents[0].items.map((entry) => entry.role), ["due_candidate"]);
});

test("table schemas expand named columns, including horizontal financial data", () => {
  const rows = [[{ text: "Долг" }, { text: "Оплата" }, { text: "Пени" }], [{ text: "75,00" }, { text: "25,00" }, { text: "5,00" }]];
  const schemas = [{ blockId: "p1.b1", columns: [
    { key: "debt", index: 0, semantic: "opening_debt" },
    { key: "paid", index: 1, semantic: "payment" },
    { key: "fee", index: 2, semantic: "penalty" },
  ] }];
  const tableItem = (role, slotName, columnKey, cell) => ({ mode: "table_columns", role, tableBlockId: "p1.b1", slots: { [slotName]: { columnKey, tokenIds: [tokenId(1, cell)] } } });
  const rowEntries = [
    { items: [{ mode: "label_value", role: "table_header", slots: { label: binding(0, [0, 1, 2], []) } }] },
    { items: [tableItem("opening_debt", "opening_debt", "debt", 0), tableItem("payment", "payment", "paid", 1), tableItem("penalty", "penalty", "fee", 2)] },
  ];
  const result = evaluate(rows, rowEntries, { layout: "table" }, "utility", schemas).receipt;
  assert.deepEqual(result.financialComponents.map((entry) => [entry.role, entry.amountMinor]), [["opening_debt", 7500n], ["payment", -2500n], ["penalty", 500n]]);

  const indexed = core.indexLiteralDocument(document([[{ text: "Услуга" }, { text: "100,00" }]], { layout: "table" }));
  const invalid = core.validateRoleClassification(indexed.document, {
    documents: [{ docId: "doc-1", documentKind: "utility", rowIds: [rowId(0)] }],
    sharedRowIds: [],
    tableSchemas: [{ blockId: "p1.b1", columns: [{ key: "name", index: 0, semantic: "name" }] }],
    rows: [{ rowId: rowId(0), items: [{ mode: "table_columns", role: "service_charge", tableBlockId: "p1.b1", slots: { charge: { columnKey: "missing" } } }] }],
  });
  assert.ok(invalid.diagnostics.some((entry) => entry.code === "unknown_table_column"));
});

test("role slot table rejects incompatible item shapes", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "Услуга" }, { text: "100,00" }]]));
  const malformed = { mode: "label_value", role: "service_charge", slots: { normative: binding(0, [1], [[1]]) } };
  const validated = core.validateRoleClassification(indexed.document, classification([{ items: [malformed] }]));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "role_slot_required"));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "role_slot_not_allowed"));
  assert.equal(validated.documents[0].items.length, 0);
});

test("printed, blank, absent, illegible, and not-applicable states remain distinct", () => {
  const printed = evaluate([[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Срок" }, { text: "", state: "blank" }]], [
    { items: [item(0, "period")] }, { items: [item(1, "due_date")] },
  ]).receipt;
  assert.equal(printed.period.state, "printed");
  assert.equal(printed.dueDate.state, "printed_blank");
  const illegible = evaluate([[{ text: "Срок" }, { text: "?", state: "illegible" }]], [{ items: [item(0, "due_date")] }]).receipt;
  assert.equal(illegible.dueDate.state, "illegible");
  assert.equal(illegible.period.state, "absent");
  const na = evaluate([[{ text: "Срок" }, { text: "", state: "blank" }]], [{ items: [item(0, "due_date", 1, [], { declaredState: "not_applicable" })] }]).receipt;
  assert.equal(na.dueDate.state, "not_applicable");
});

test("unsigned advance is normalized by its fixed role", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Аванс" }, { text: "20,00" }], [{ text: "К оплате" }, { text: "80,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_advance", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  assert.equal(result.receipt.financialComponents.find((entry) => entry.role === "opening_advance").amountMinor, -2000n);
  assert.equal(result.mandatoryDue.status, "confirmed");
});

test("an explicit fixed-role sign conflict is not silently corrected", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Аванс" }, { text: "+20,00" }], [{ text: "К оплате" }, { text: "80,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_advance", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  const component = result.receipt.financialComponents.find((entry) => entry.role === "opening_advance");
  assert.equal(component.amountMinor, 2000n);
  assert.equal(component.confirmed, false);
  assert.ok(result.receipt.diagnostics.some((entry) => entry.code === "fixed_role_sign_conflict"));
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "ambiguous");
  assert.equal(result.mandatoryDue.status, "needs_review");
});

test("printed negative overpayment closes without sign guessing", () => {
  const rows = [[{ text: "Период" }, { text: "Май 2032" }], [{ text: "Начислено" }, { text: "75,00" }], [{ text: "Переплата" }, { text: "-25,00" }], [{ text: "Итого" }, { text: "50,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_advance", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  assert.equal(finish(rows, roles).result.mandatoryDue.valueMinor, 5000n);
});

test("printed zero and negative due values remain valid", () => {
  const zero = basicFinancialRows({ accrued: "0,00", due: "0,00" });
  assert.equal(finish(zero.rows, zero.roles).result.mandatoryDue.valueMinor, 0n);
  const rows = [[{ text: "Период" }, { text: "Июнь 2031" }], [{ text: "Начислено" }, { text: "50,00" }], [{ text: "Аванс" }, { text: "100,00" }], [{ text: "Остаток" }, { text: "-50,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_advance", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const result = finish(rows, roles).result;
  assert.equal(result.receipt.closingBalance.state, "absent");
  assert.equal(result.computedClosingBalance, null);
  assert.equal(result.computedDue, -5000n);
  assert.equal(result.mandatoryDue.valueMinor, -5000n);
  assert.equal(result.mandatoryDue.status, "confirmed");
});

test("S02 reconciles a printed closing overpayment before a separate zero due", () => {
  const rows = [
    [{ text: "Период" }, { text: "Сентябрь 2031" }],
    [{ text: "Переплата на начало периода" }, { text: "3 100,00" }],
    [{ text: "Начислено за период" }, { text: "2 554,40" }],
    [{ text: "Оплачено в периоде" }, { text: "0,00" }],
    [{ text: "Переплата на конец периода" }, { text: "545,60" }],
    [{ text: "Сумма к оплате" }, { text: "0,00" }],
  ];
  const roles = [
    { items: [item(0, "period")] },
    { items: [item(1, "opening_advance", 1, [[1]])] },
    { items: [item(2, "accrued_total", 1, [[1]])] },
    { items: [item(3, "payment", 1, [[1]])] },
    { items: [item(4, "closing_advance", 1, [[1]])] },
    { items: [item(5, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  const e2 = result.reconciliations.find((entry) => entry.equation === "E2");
  assert.equal(result.receipt.closingBalance.value, -54560n);
  assert.deepEqual(result.receipt.closingBalance.sourceCellIds, [cellId(4, 1)]);
  assert.deepEqual(result.receipt.closingBalance.sourceTokenIds, [tokenId(4, 1)]);
  assert.equal(result.receipt.financialComponents.some((entry) => entry.id.includes("closing_balance")), false);
  assert.equal(result.receipt.financialComponents.some((entry) => entry.id.includes("closing_advance")), false);
  assert.equal(result.receipt.serviceLines.length, 0);
  assert.equal(e2.target, "closing_balance");
  assert.equal(e2.status, "closed");
  assert.equal(e2.expectedMinor, -54560n);
  assert.equal(e2.actualMinor, -54560n);
  assert.deepEqual(e2.candidateSourceIds, [tokenId(5, 1)]);
  assert.deepEqual(result.receipt.dueCandidates[0].sourceTokenIds, [tokenId(5, 1)]);
  assert.equal(result.computedClosingBalance, -54560n);
  assert.equal(result.computedDue, 0n);
  assert.equal(result.mandatoryDue.valueMinor, 0n);
  assert.equal(result.mandatoryDue.status, "confirmed");
  assert.equal(result.draft.decision, "confirmed_draft");
  assert.equal(result.draft.includeInMonthlyTotal, true);
});

test("a signless closing debt becomes positive and must match the separate printed due", () => {
  const rows = [
    [{ text: "Период" }, { text: "Сентябрь 2031" }],
    [{ text: "Начислено" }, { text: "100,00" }],
    [{ text: "Входящий долг" }, { text: "20,00" }],
    [{ text: "Задолженность на конец периода" }, { text: "120,00" }],
    [{ text: "К оплате" }, { text: "120,00" }],
  ];
  const roles = [
    { items: [item(0, "period")] },
    { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_debt", 1, [[1]])] },
    { items: [item(3, "closing_debt", 1, [[1]])] },
    { items: [item(4, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  const e2 = result.reconciliations.find((entry) => entry.equation === "E2");
  assert.equal(e2.status, "closed");
  assert.equal(e2.target, "closing_balance");
  assert.equal(result.receipt.closingBalance.value, 12000n);
  assert.equal(result.computedClosingBalance, 12000n);
  assert.equal(result.computedDue, 12000n);
  assert.equal(result.mandatoryDue.valueMinor, 12000n);
  assert.equal(result.mandatoryDue.status, "confirmed");
});

test("an explicitly signed neutral closing balance preserves its literal sign", () => {
  const rows = [
    [{ text: "Период" }, { text: "Сентябрь 2031" }],
    [{ text: "Начислено" }, { text: "75,00" }],
    [{ text: "Входящий аванс" }, { text: "100,00" }],
    [{ text: "Сальдо на конец" }, { text: "-25,00" }],
    [{ text: "К оплате" }, { text: "0,00" }],
  ];
  const roles = [
    { items: [item(0, "period")] },
    { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_advance", 1, [[1]])] },
    { items: [item(3, "closing_balance", 1, [[1]])] },
    { items: [item(4, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  assert.equal(result.receipt.closingBalance.value, -2500n);
  assert.equal(result.computedClosingBalance, -2500n);
  assert.equal(result.computedDue, 0n);
  assert.equal(result.mandatoryDue.status, "confirmed");
});

test("an unsigned neutral closing balance remains ambiguous and review-only", () => {
  const rows = [
    [{ text: "Период" }, { text: "Сентябрь 2031" }],
    [{ text: "Начислено" }, { text: "75,00" }],
    [{ text: "Сальдо на конец" }, { text: "75,00" }],
    [{ text: "К оплате" }, { text: "75,00" }],
  ];
  const roles = [
    { items: [item(0, "period")] },
    { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "closing_balance", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  const e2 = result.reconciliations.find((entry) => entry.equation === "E2");
  assert.equal(result.receipt.closingBalance.state, "printed");
  assert.equal(result.receipt.closingBalance.value, null);
  assert.ok(result.receipt.diagnostics.some((entry) => entry.code === "closing_balance_sign_missing"));
  assert.equal(e2.status, "ambiguous");
  assert.deepEqual(e2.reasons, ["closing_balance_sign_missing"]);
  assert.equal(result.computedClosingBalance, null);
  assert.equal(result.computedDue, null);
  assert.equal(result.mandatoryDue.status, "needs_review");
  assert.equal(result.draft.decision, "partial_draft");
});

test("debt, current payment, and adjustments already in accrual retain separate roles", () => {
  const rows = [
    [{ text: "Период" }, { text: "Май 2033" }], [{ text: "Начислено" }, { text: "14 000,00" }],
    [{ text: "Входящий долг" }, { text: "75 000,00" }], [{ text: "Оплачено" }, { text: "74 000,00" }],
    [{ text: "Перерасчёт" }, { text: "-200,00" }], [{ text: "Пени" }, { text: "50,00" }],
    [{ text: "К оплате" }, { text: "15 000,00" }],
  ];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_debt", 1, [[1]])] }, { items: [item(3, "payment", 1, [[1]])] },
    { items: [item(4, "recalculation", 1, [[1]], { affectsDue: "already_in_accrual" })] },
    { items: [item(5, "penalty", 1, [[1]], { affectsDue: "already_in_accrual" })] },
    { items: [item(6, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const { result } = finish(rows, roles);
  assert.equal(result.computedDue, 1500000n);
  assert.equal(result.mandatoryDue.status, "confirmed");
});

test("computed mandatory due without a printed candidate is reviewable, not absent", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }]];
  const roles = [{ items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] }];
  const { result } = finish(rows, roles);
  assert.deepEqual(result.mandatoryDue, { status: "needs_review", valueMinor: 10000n, source: "computed", reasons: ["printed_due_absent"] });
  assert.equal(result.computedDue, null);
  assert.equal(result.diagnosticComputedDue, 10000n);
  assert.equal(result.draft.decision, "partial_draft");
});

test("exactly one optional-excluded candidate that closes E2 can be confirmed", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Страховка" }, { text: "20,00" }], [{ text: "Услуга" }, { text: "100,00" }], [{ text: "Обязательно" }, { text: "100,00" }], [{ text: "Другой итог" }, { text: "130,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "optional_charge", 1, [[1]])] },
    { items: [item(3, "service_charge", 1, [[1]])] },
    { items: [item(4, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
    { items: [item(5, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "included" })] },
  ];
  const { result } = finish(rows, roles);
  assert.equal(result.mandatoryDue.status, "confirmed");
  assert.equal(result.mandatoryDue.valueMinor, 10000n);
  assert.equal(result.mandatoryDue.candidateId, result.reconciliations.find((entry) => entry.equation === "E2").candidateId);
});

test("same amount with incompatible due axes is not merged", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Итого A" }, { text: "100,00" }], [{ text: "Итого B" }, { text: "100,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "included" })] },
  ];
  const receipt = finish(rows, roles).result.receipt;
  assert.equal(receipt.dueCandidates.length, 2);
  assert.ok(receipt.diagnostics.some((entry) => entry.code === "due_candidate_axis_conflict"));
});

test("same semantic due candidate is deduplicated and preserves source IDs", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "К оплате" }, { text: "100,00" }], [{ text: "Итого" }, { text: "100,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
  ];
  const candidate = finish(rows, roles).result.receipt.dueCandidates[0];
  assert.equal(candidate.amountMinor, 10000n);
  assert.deepEqual(candidate.sourceTokenIds, [tokenId(2, 1), tokenId(3, 1)]);
});

test("sole optional-inclusive total remains review-only", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Добровольно" }, { text: "25,00" }], [{ text: "Всего" }, { text: "125,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "optional_charge", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "included" })] },
  ];
  const { result } = finish(rows, roles);
  assert.equal(result.mandatoryDue.status, "needs_review");
  assert.equal(result.mandatoryDue.valueMinor, 10000n);
  assert.equal(result.mandatoryDue.source, "computed_excluding_optional");
});

test("candidate-specific computed due retains the disputed component selected by E2", () => {
  const rows = [
    [{ text: "Период" }, { text: "Сентябрь 2031" }],
    [{ text: "Начислено" }, { text: "100,00" }],
    [{ text: "Спорный компонент" }, { text: "20,00" }],
    [{ text: "Добровольно" }, { text: "25,00" }],
    [{ text: "Напечатанный итог" }, { text: "145,00" }],
  ];
  const roles = [
    { items: [item(0, "period")] },
    { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "penalty", 1, [[1]], { affectsDue: "unknown" })] },
    { items: [item(3, "optional_charge", 1, [[1]])] },
    { items: [item(4, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "included" })] },
  ];
  const { result } = finish(rows, roles);
  const e2 = result.reconciliations.find((entry) => entry.equation === "E2");
  const disputedId = result.receipt.financialComponents.find((entry) => entry.role === "penalty").id;
  const optionalId = result.receipt.optionalCharges[0].id;
  assert.equal(e2.status, "closed");
  assert.equal(result.diagnosticComputedDue, 10000n);
  assert.equal(result.computedDue, 14500n);
  assert.ok(e2.formula.includedComponentIds.includes(disputedId));
  assert.ok(e2.formula.includedComponentIds.includes(optionalId));
  assert.deepEqual(e2.formula.optionalComponentIds, [optionalId]);
  assert.equal(result.mandatoryDue.status, "needs_review");
  assert.equal(result.mandatoryDue.source, "computed_excluding_optional");
  assert.equal(result.mandatoryDue.valueMinor, 12000n);
  assert.equal(result.mandatoryDue.candidateId, e2.candidateId);
});

test("zero balance makes period-only and with-balance formulas materially equivalent", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Баланс" }, { text: "0,00" }], [{ text: "К оплате" }, { text: "100,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_balance", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "unknown", optionalScope: "excluded" })] },
  ];
  const result = finish(rows, roles).result;
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "closed");
  assert.equal(result.mandatoryDue.status, "needs_review");
  assert.ok(result.mandatoryDue.reasons.includes("weak_e2_closure"));
});

test("two materially different closing formulas remain ambiguous", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Долг" }, { text: "20,00" }], [{ text: "Оплата" }, { text: "20,00" }], [{ text: "К оплате" }, { text: "100,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_debt", 1, [[1]], { affectsDue: "unknown" })] },
    { items: [item(3, "payment", 1, [[1]], { affectsDue: "unknown" })] },
    { items: [item(4, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  assert.equal(finish(rows, roles).result.reconciliations.find((entry) => entry.equation === "E2").status, "ambiguous");
});

test("more than three disputed axes stops bounded E2 enumeration", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Долг" }, { text: "1,00" }], [{ text: "Оплата" }, { text: "1,00" }], [{ text: "Пени" }, { text: "1,00" }], [{ text: "Перерасчёт" }, { text: "1,00" }], [{ text: "К оплате" }, { text: "100,00" }]];
  const disputed = ["opening_debt", "payment", "penalty", "recalculation"];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    ...disputed.map((role, index) => ({ items: [item(index + 2, role, 1, [[1]], { affectsDue: "unknown" })] })),
    { items: [item(6, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const e2 = finish(rows, roles).result.reconciliations.find((entry) => entry.equation === "E2");
  assert.equal(e2.status, "ambiguous");
  assert.deepEqual(e2.reasons, ["too_many_disputed_categories"]);
});

test("a printed due that does not match remains open, not repaired", () => {
  const scenario = basicFinancialRows({ due: "120,00" });
  const result = finish(scenario.rows, scenario.roles).result;
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "open");
  assert.equal(result.receipt.dueCandidates[0].amountMinor, 12000n);
  assert.equal(result.computedDue, null);
  assert.equal(result.diagnosticComputedDue, 10000n);
});

test("missing financial evidence produces insufficient reconciliation", () => {
  const result = finish([[{ text: "Период" }, { text: "Август 2031" }]], [{ items: [item(0, "period")] }]).result;
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "insufficient");
  assert.equal(result.draft.decision, "partial_draft");
});

test("named slots make service arithmetic independent of numeric token order", () => {
  const rows = [[{ text: "Начислено" }, { text: "60,00" }], [{ text: "Услуга" }, { text: "60,00" }, { text: "20,00" }, { text: "3" }]];
  const service = {
    mode: "label_value", role: "service_charge", slots: {
      name: binding(1, [0], []), charge: binding(1, [1], [[1]]), tariff: binding(1, [2], [[2]]), volume: binding(1, [3], [[3]]),
    },
  };
  const result = finish(rows, [{ items: [item(0, "accrued_total", 1, [[1]])] }, { items: [service] }]).result;
  const e3 = result.reconciliations.find((entry) => entry.equation === "E3");
  assert.equal(e3.status, "closed");
  assert.equal(e3.actualMinor, 6000n);
});

test("E3 reports a mismatch without replacing the printed charge", () => {
  const rows = [[{ text: "Начислено" }, { text: "70,00" }], [{ text: "Услуга" }, { text: "70,00" }, { text: "20,00" }, { text: "3" }]];
  const service = {
    mode: "label_value", role: "service_charge", slots: {
      name: binding(1, [0], []), charge: binding(1, [1], [[1]]), tariff: binding(1, [2], [[2]]), volume: binding(1, [3], [[3]]),
    },
  };
  const result = finish(rows, [{ items: [item(0, "accrued_total", 1, [[1]])] }, { items: [service] }]).result;
  const e3 = result.reconciliations.find((entry) => entry.equation === "E3");
  assert.equal(e3.status, "open");
  assert.equal(e3.actualMinor, 6000n);
  assert.equal(result.receipt.serviceLines[0].amountMinor, 7000n);
});

test("blank meter stays blank and normative value cannot become a reading", () => {
  const rows = [[{ text: "Счётчик A" }, { text: "", state: "blank" }], [{ text: "Счётчик B" }, { text: "0" }], [{ text: "Норматив" }, { text: "4,2" }]];
  const roles = [
    { items: [item(0, "meter_reading")] }, { items: [item(1, "meter_reading", 1, [[1]])] },
    { items: [item(2, "normative_reference", 1, [[1]])] },
  ];
  const receipt = evaluate(rows, roles).receipt;
  assert.equal(receipt.meters.length, 2);
  assert.equal(receipt.meters[0].state, "printed_blank");
  assert.equal(receipt.meters[0].current, null);
  assert.equal(receipt.meters[1].current.coefficient, 0n);
});

test("subtotal and headers do not duplicate service accrual", () => {
  const rows = [[{ text: "Начислено" }, { text: "100,00" }], [{ text: "Услуга" }, { text: "100,00" }], [{ text: "Промежуточный итог" }, { text: "100,00" }], [{ text: "Раздел услуг" }]];
  const roles = [
    { items: [item(0, "accrued_total", 1, [[1]])] }, { items: [item(1, "service_charge", 1, [[1]])] },
    { items: [item(2, "subtotal", 1, [[1]])] }, { items: [item(3, "section_title", 0, [])] },
  ];
  const result = core.reconcileReceipt(evaluate(rows, roles).receipt);
  assert.equal(result.receipt.serviceLines.length, 2);
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E1").status, "closed");
});

test("row and item permutations produce the same canonical result", () => {
  const rows = [[{ text: "Начислено" }, { text: "100,00" }, { text: "Долг" }, { text: "20,00" }], [{ text: "К оплате" }, { text: "120,00" }]];
  const accrued = { mode: "label_value", role: "accrued_total", slots: { accrued_total: binding(0, [1], [[1]]) } };
  const debt = { mode: "label_value", role: "opening_debt", slots: { opening_debt: binding(0, [3], [[3]]) } };
  const due = item(1, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" });
  const indexed = core.indexLiteralDocument(document(rows));
  const segmented = (classifiedRows) => ({ documents: [{ docId: "doc-1", documentKind: "utility", rowIds: [rowId(0), rowId(1)] }], sharedRowIds: [], tableSchemas: [], rows: classifiedRows });
  const forwardValidated = core.validateRoleClassification(indexed.document, segmented([{ rowId: rowId(0), items: [accrued, debt] }, { rowId: rowId(1), items: [due] }]));
  const reverseValidated = core.validateRoleClassification(indexed.document, segmented([{ rowId: rowId(1), items: [due] }, { rowId: rowId(0), items: [debt, accrued] }]));
  const forward = core.buildCanonicalReceipt(indexed, forwardValidated.documents[0]);
  const reverse = core.buildCanonicalReceipt(indexed, reverseValidated.documents[0]);
  const projection = (receipt) => ({ accrued: receipt.accruedTotal.value, components: receipt.financialComponents.map((entry) => [entry.role, entry.amountMinor]).sort(), due: receipt.dueCandidates.map((entry) => entry.amountMinor) });
  assert.deepEqual(projection(forward), projection(reverse));
  assert.deepEqual(core.reconcileReceipt(forward).mandatoryDue, core.reconcileReceipt(reverse).mandatoryDue);
});

test("unknown documents with period or amount become partial drafts; confirmed other rejects", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }]];
  const roles = [{ items: [item(0, "period")] }];
  assert.equal(finish(rows, roles, {}, "unknown").result.draft.decision, "partial_draft");
  assert.equal(finish(rows, roles, {}, "other").result.draft.decision, "reject");
});

test("hard draft failures remain unreadable or missing period and amount", () => {
  const noEvidence = finish([[{ text: "Поставщик" }, { text: "Синтетический" }]], [{ items: [item(0, "provider")] }]).result;
  assert.equal(noEvidence.draft.decision, "reject");
  const unreadable = finish([[{ text: "Период" }, { text: "Август 2031" }]], [{ items: [item(0, "period")] }], { readable: false }).result;
  assert.equal(unreadable.draft.decision, "reject");
});

test("bad table spans isolate the affected row", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "Услуга A" }, { text: "100,00" }], [{ text: "Услуга B", colSpan: 1 }]], { layout: "table" }));
  assert.ok(indexed.diagnostics.some((entry) => entry.code === "invalid_span" && entry.rowId === rowId(1)));
  const validated = core.validateRoleClassification(indexed.document, classification([
    { items: [item(0, "service_charge", 1, [[1]])] }, { items: [item(1, "service_charge", 0, [])] },
  ]));
  assert.equal(core.buildCanonicalReceipt(indexed, validated.documents[0]).serviceLines.length, 1);
});

test("unknown rows remain structural-only in safe diagnostics", () => {
  const { result } = finish([[{ text: "Непонятная справочная строка" }]], [{ items: [item(0, "unknown", 0, [])] }]);
  assert.deepEqual(result.receipt.unknownRowIds, [rowId(0)]);
  assert.equal(core.safeReceiptDiagnostic(result).counts.unknownRows, 1);
  assert.doesNotMatch(JSON.stringify(core.safeReceiptDiagnostic(result)), /Непонятная/u);
});

test("printed and computed due stay separate and reconciliation records the selected source", () => {
  const scenario = basicFinancialRows();
  const { result } = finish(scenario.rows, scenario.roles);
  const e2 = result.reconciliations.find((entry) => entry.equation === "E2");
  assert.equal(result.receipt.dueCandidates[0].amountMinor, 10000n);
  assert.equal(result.computedDue, 10000n);
  assert.equal(result.mandatoryDue.source, "printed");
  assert.equal(e2.candidateId, result.receipt.dueCandidates[0].id);
  assert.deepEqual(e2.candidateSourceIds, result.receipt.dueCandidates[0].sourceTokenIds);
  assert.deepEqual(e2.formula.includedComponentIds, [`accrued:${tokenId(1, 1)}`]);
});

function bundleClassification(rowEntries, documents, sharedRowIds = []) {
  return {
    documents,
    sharedRowIds,
    tableSchemas: [],
    rows: rowEntries.map((entry, index) => ({ rowId: entry.rowId ?? rowId(index), items: entry.items })),
  };
}

test("S07-style page returns two independent utility results", () => {
  const rows = [
    [{ text: "Период" }, { text: "09.2026" }],
    [{ text: "A начислено" }, { text: "100,00" }], [{ text: "A долг" }, { text: "20,00" }], [{ text: "A к оплате" }, { text: "120,00" }],
    [{ text: "B начислено" }, { text: "70,00" }], [{ text: "B аванс" }, { text: "10,00" }], [{ text: "B к оплате" }, { text: "60,00" }],
  ];
  const entries = [
    { items: [item(0, "billing_period")] },
    { items: [item(1, "accrued_total", 1, [[1]])] }, { items: [item(2, "opening_debt", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
    { items: [item(4, "accrued_total", 1, [[1]])] }, { items: [item(5, "opening_advance", 1, [[1]])] },
    { items: [item(6, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const indexed = core.indexLiteralDocument(document(rows));
  const result = core.processReceiptBundle(indexed, bundleClassification(entries, [
    { docId: "receipt-a", documentKind: "utility", rowIds: [rowId(1), rowId(2), rowId(3)] },
    { docId: "receipt-b", documentKind: "utility", rowIds: [rowId(4), rowId(5), rowId(6)] },
  ], [rowId(0)]));
  assert.deepEqual(result.documents.map((entry) => entry.docId), ["receipt-a", "receipt-b"]);
  assert.deepEqual(result.documents.map((entry) => entry.result.mandatoryDue.valueMinor), [12000n, 6000n]);
  assert.deepEqual(result.documents.map((entry) => entry.result.receipt.period.value), ["2026-09", "2026-09"]);
  assert.ok(result.documents.every((entry) => entry.result.draft.decision === "confirmed_draft"));
});

test("multi-document decisions isolate utility, other, and ambiguous documents", () => {
  const rows = [
    [{ text: "Период A" }, { text: "09/2026" }], [{ text: "Начислено A" }, { text: "50,00" }], [{ text: "Долг A" }, { text: "10,00" }], [{ text: "Итого A" }, { text: "60,00" }],
    [{ text: "Справка" }],
    [{ text: "Период C" }, { text: "Сентябрь 2026" }], [{ text: "Начислено C" }, { text: "40,00" }], [{ text: "Аванс C" }, { text: "+5,00" }], [{ text: "Итого C" }, { text: "35,00" }],
  ];
  const entries = [
    { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] }, { items: [item(2, "opening_debt", 1, [[1]])] }, { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
    { items: [item(4, "other", 0, [])] },
    { items: [item(5, "billing_period")] }, { items: [item(6, "accrued_total", 1, [[1]])] }, { items: [item(7, "opening_advance", 1, [[1]])] }, { items: [item(8, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const indexed = core.indexLiteralDocument(document(rows));
  const result = core.processReceiptBundle(indexed, bundleClassification(entries, [
    { docId: "a", documentKind: "utility", rowIds: [rowId(0), rowId(1), rowId(2), rowId(3)] },
    { docId: "b", documentKind: "other", rowIds: [rowId(4)] },
    { docId: "c", documentKind: "utility", rowIds: [rowId(5), rowId(6), rowId(7), rowId(8)] },
  ]));
  assert.deepEqual(result.documents.map((entry) => entry.result.draft.decision), ["confirmed_draft", "reject", "partial_draft"]);
  assert.equal(result.documents[0].result.mandatoryDue.valueMinor, 6000n);
  assert.equal(result.documents[2].result.reconciliations.find((entry) => entry.equation === "E2").status, "ambiguous");
});

test("segmentation reports duplicate, uncovered, unknown, and financial shared rows", () => {
  const rows = [[{ text: "Период" }, { text: "09.2026" }], [{ text: "Начислено" }, { text: "10,00" }], [{ text: "Не покрыто" }]];
  const entries = [{ items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] }, { items: [item(2, "unknown", 0, [])] }];
  const indexed = core.indexLiteralDocument(document(rows));
  const duplicate = core.validateRoleClassification(indexed.document, bundleClassification(entries, [
    { docId: "a", documentKind: "utility", rowIds: [rowId(0)] },
    { docId: "b", documentKind: "utility", rowIds: [rowId(0)] },
  ], [rowId(1), "p9.b9.r9"]));
  assert.ok(duplicate.diagnostics.some((entry) => entry.code === "segmentation_row_duplicate" && entry.rowId === rowId(0)));
  assert.ok(duplicate.diagnostics.some((entry) => entry.code === "segmentation_row_missing" && entry.rowId === rowId(2)));
  assert.ok(duplicate.diagnostics.some((entry) => entry.code === "segmentation_unknown_row"));
  assert.ok(duplicate.diagnostics.some((entry) => entry.code === "shared_row_role_not_allowed" && entry.rowId === rowId(1)));
  assert.ok(duplicate.documents.every((entry) => entry.items.every((classified) => classified.role !== "accrued_total")));
  assert.equal(duplicate.validity.status, "needs_review");
});

test("an uncovered literal row prevents an otherwise closed document from being confirmed", () => {
  const rows = [
    [{ text: "Период" }, { text: "09.2031" }],
    [{ text: "Начислено" }, { text: "100,00" }],
    [{ text: "Долг" }, { text: "20,00" }],
    [{ text: "К оплате" }, { text: "120,00" }],
    [{ text: "Неназначенная исходная строка" }],
  ];
  const entries = [
    { items: [item(0, "billing_period")] },
    { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_debt", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
    { items: [item(4, "unknown", 0, [])] },
  ];
  const indexed = core.indexLiteralDocument(document(rows));
  const bundle = core.processReceiptBundle(indexed, bundleClassification(entries, [
    { docId: "receipt", documentKind: "utility", rowIds: [rowId(0), rowId(1), rowId(2), rowId(3)] },
  ]));
  const output = bundle.documents[0];
  assert.equal(bundle.segmentationValidity.status, "needs_review");
  assert.ok(bundle.segmentationValidity.reasons.includes("segmentation_row_missing"));
  assert.equal(output.result.mandatoryDue.valueMinor, 12000n);
  assert.equal(output.result.mandatoryDue.status, "needs_review");
  assert.equal(output.result.draft.decision, "partial_draft");
  assert.equal(output.result.draft.includeInMonthlyTotal, false);
});

test("a document-local segmentation error does not downgrade an independent document", () => {
  const rows = [
    [{ text: "A период" }, { text: "09.2031" }], [{ text: "A начислено" }, { text: "50,00" }],
    [{ text: "A долг" }, { text: "10,00" }], [{ text: "A итог" }, { text: "60,00" }],
    [{ text: "B период" }, { text: "09.2031" }], [{ text: "B начислено" }, { text: "70,00" }],
    [{ text: "B долг" }, { text: "5,00" }], [{ text: "B итог" }, { text: "75,00" }],
  ];
  const entries = [
    { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_debt", 1, [[1]])] }, { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
    { items: [item(4, "billing_period")] }, { items: [item(5, "accrued_total", 1, [[1]])] },
    { items: [item(6, "opening_debt", 1, [[1]])] }, { items: [item(7, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const indexed = core.indexLiteralDocument(document(rows));
  const bundle = core.processReceiptBundle(indexed, bundleClassification(entries, [
    { docId: "a", documentKind: "utility", rowIds: [rowId(0), rowId(1), rowId(2), rowId(3), "p9.b9.r9"] },
    { docId: "b", documentKind: "utility", rowIds: [rowId(4), rowId(5), rowId(6), rowId(7)] },
  ]));
  assert.equal(bundle.segmentationValidity.status, "valid");
  assert.equal(bundle.documents.find((entry) => entry.docId === "a").result.draft.decision, "partial_draft");
  assert.equal(bundle.documents.find((entry) => entry.docId === "b").result.draft.decision, "confirmed_draft");
});

test("duplicate document IDs collapse to one blocked output", () => {
  const scenario = basicFinancialRows({ accrued: "80,00", due: "100,00" });
  scenario.rows.splice(2, 0, [{ text: "Долг" }, { text: "20,00" }]);
  scenario.roles.splice(2, 0, { items: [item(2, "opening_debt", 1, [[1]])] });
  const due = scenario.roles[3].items[0];
  due.slots.label = binding(3, [0], []);
  due.slots.due_candidate = binding(3, [1], [[1]]);
  const indexed = core.indexLiteralDocument(document(scenario.rows));
  const rows = scenario.roles.map((entry, index) => ({ rowId: rowId(index), items: entry.items }));
  const bundle = core.processReceiptBundle(indexed, {
    documents: [
      { docId: "same", documentKind: "utility", rowIds: rows.map((row) => row.rowId) },
      { docId: "same", documentKind: "utility", rowIds: rows.map((row) => row.rowId) },
    ], sharedRowIds: [], tableSchemas: [], rows,
  });
  assert.equal(bundle.documents.length, 1);
  assert.equal(bundle.documents[0].classificationValidity.status, "needs_review");
  assert.notEqual(bundle.documents[0].result.draft.decision, "confirmed_draft");
});

test("document and row permutation does not change bundle results", () => {
  const rows = [[{ text: "Период" }, { text: "09.2026" }], [{ text: "A" }, { text: "10,00" }], [{ text: "B" }, { text: "20,00" }]];
  const entries = [{ items: [item(0, "billing_period")] }, { items: [item(1, "due_candidate", 1, [[1]], { optionalScope: "excluded" })] }, { items: [item(2, "due_candidate", 1, [[1]], { optionalScope: "excluded" })] }];
  const indexed = core.indexLiteralDocument(document(rows));
  const docs = [{ docId: "b", documentKind: "utility", rowIds: [rowId(2)] }, { docId: "a", documentKind: "utility", rowIds: [rowId(1)] }];
  const forward = core.processReceiptBundle(indexed, bundleClassification(entries, docs, [rowId(0)]));
  const reverse = core.processReceiptBundle(indexed, bundleClassification([...entries].reverse().map((entry, index) => ({ ...entry, rowId: rowId(2 - index) })), [...docs].reverse(), [rowId(0)]));
  const projection = (bundle) => bundle.documents.map(({ docId, result }) => [docId, result.receipt.period.value, result.mandatoryDue.valueMinor]);
  assert.deepEqual(projection(forward), projection(reverse));
});

test("billing period parser supports deterministic formats and same-month ranges", () => {
  const cases = new Map([
    ["09.2026", "2026-09"], ["09/2026", "2026-09"], ["09.26", "2026-09"],
    ["сентябрь 2026", "2026-09"], ["с 01.09.2026 по 30.09.2026", "2026-09"],
  ]);
  for (const [raw, expected] of cases) assert.deepEqual(core.parseBillingPeriodText(raw), { status: "parsed", candidates: [expected] });
  assert.deepEqual(core.parseBillingPeriodText("31.08.2026 - 01.09.2026"), { status: "ambiguous", candidates: ["2026-08", "2026-09"] });
  assert.deepEqual(core.parseBillingPeriodText("отчётный сезон"), { status: "unsupported", candidates: [] });
});

test("billing period parser rejects impossible dates without substring fallback", () => {
  for (const raw of ["31.02.2026", "00.09.2026", "32.01.2026", "29.02.2025"]) {
    assert.deepEqual(core.parseBillingPeriodText(raw), { status: "unsupported", candidates: [] });
  }
  assert.deepEqual(core.parseBillingPeriodText("29.02.2024"), { status: "parsed", candidates: ["2024-02"] });
  assert.deepEqual(core.parseBillingPeriodText("с 01.09.2026 по 30.09.2026"), { status: "parsed", candidates: ["2026-09"] });
  assert.deepEqual(core.parseBillingPeriodText("31.08.2026 - 01.09.2026"), { status: "ambiguous", candidates: ["2026-08", "2026-09"] });
});

test("period failures preserve mandatory due but gate confirmed drafts", () => {
  const missing = basicFinancialRows();
  missing.rows.shift(); missing.roles.shift();
  const missingResult = finish(missing.rows, missing.roles.map((entry, index) => ({ ...entry, items: entry.items.map((entryItem) => ({ ...entryItem, slots: Object.fromEntries(Object.entries(entryItem.slots).map(([name, value]) => [name, { ...value, cellIds: value.cellIds.map((id) => id.replace(/r\d+/u, `r${index + 1}`)), tokenIds: value.tokenIds?.map((id) => id.replace(/r\d+/u, `r${index + 1}`)) }])) })) }))).result;
  assert.equal(missingResult.mandatoryDue.valueMinor, 10000n);
  assert.equal(missingResult.draft.decision, "partial_draft");
  assert.ok(missingResult.draft.reasons.includes("billing_period_missing"));

  const rows = [[{ text: "Периоды" }, { text: "09.2026 / 10.2026" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Долг" }, { text: "10,00" }], [{ text: "К оплате" }, { text: "110,00" }]];
  const roles = [{ items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] }, { items: [item(2, "opening_debt", 1, [[1]])] }, { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] }];
  const conflict = finish(rows, roles).result;
  assert.equal(conflict.receipt.period.parseStatus, "ambiguous");
  assert.equal(conflict.mandatoryDue.status, "confirmed");
  assert.equal(conflict.draft.decision, "partial_draft");
});

test("E2 closure strength distinguishes weak, E1-supported, and multi-component evidence", () => {
  const weakScenario = basicFinancialRows();
  const weak = finish(weakScenario.rows, weakScenario.roles).result;
  const weakE2 = weak.reconciliations.find((entry) => entry.equation === "E2");
  assert.equal(weakE2.closureStrength.rating, "weak");
  assert.equal(weakE2.closureStrength.componentCount, 1);
  assert.equal(weak.mandatoryDue.status, "needs_review");
  assert.equal(weak.mandatoryDue.valueMinor, 10000n);
  assert.equal(weak.mandatoryDue.candidateId, weak.receipt.dueCandidates[0].id);
  assert.ok(weak.mandatoryDue.reasons.includes("weak_e2_closure"));
  assert.equal(weak.draft.decision, "partial_draft");

  const e1Rows = [...weakScenario.rows, [{ text: "Услуга" }, { text: "100,00" }]];
  const e1Roles = [...weakScenario.roles, { items: [item(3, "service_charge", 1, [[1]])] }];
  const withE1 = finish(e1Rows, e1Roles).result;
  assert.equal(withE1.reconciliations.find((entry) => entry.equation === "E2").closureStrength.rating, "strong");
  assert.equal(withE1.draft.decision, "confirmed_draft");

  const rows = [[{ text: "Период" }, { text: "09.2026" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Долг" }, { text: "20,00" }], [{ text: "К оплате" }, { text: "120,00" }]];
  const roles = [{ items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] }, { items: [item(2, "opening_debt", 1, [[1]])] }, { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] }];
  const multi = finish(rows, roles).result.reconciliations.find((entry) => entry.equation === "E2").closureStrength;
  assert.equal(multi.rating, "strong");
  assert.equal(multi.componentCount, 2);
});

test("independent repeated due in another block strengthens one-component E2", () => {
  const input = document([]);
  input.pages[0].blocks = [
    { layout: "kv", bbox: { x: 0, y: 0, width: 1, height: 0.45 }, rows: [
      { cells: [{ text: "Период", state: "ok", bbox: box }, { text: "09.2026", state: "ok", bbox: box }] },
      { cells: [{ text: "Начислено", state: "ok", bbox: box }, { text: "100,00", state: "ok", bbox: box }] },
      { cells: [{ text: "К оплате", state: "ok", bbox: box }, { text: "100,00", state: "ok", bbox: box }] },
    ] },
    { layout: "kv", bbox: { x: 0, y: 0.5, width: 1, height: 0.45 }, rows: [
      { cells: [{ text: "Корешок", state: "ok", bbox: box }, { text: "100,00", state: "ok", bbox: box }] },
    ] },
  ];
  const indexed = core.indexLiteralDocument(input);
  const bind = (row, cell, token = true) => ({ cellIds: [`${row}.c${cell}`], ...(token ? { tokenIds: [`${row}.c${cell}#1`] } : {}) });
  const labelItem = (row, role, slotName, extra = {}) => ({ mode: "label_value", role, slots: { label: bind(row, 1, false), [slotName]: bind(row, 2) }, ...extra });
  const classificationInput = {
    documents: [{ docId: "receipt", documentKind: "utility", rowIds: ["p1.b1.r1", "p1.b1.r2", "p1.b1.r3", "p1.b2.r1"] }], sharedRowIds: [], tableSchemas: [],
    rows: [
      { rowId: "p1.b1.r1", items: [{ mode: "label_value", role: "billing_period", slots: { label: bind("p1.b1.r1", 1, false), billing_period: bind("p1.b1.r1", 2, false) } }] },
      { rowId: "p1.b1.r2", items: [labelItem("p1.b1.r2", "accrued_total", "accrued_total")] },
      { rowId: "p1.b1.r3", items: [labelItem("p1.b1.r3", "due_candidate", "due_candidate", { dueScope: "with_balance", optionalScope: "excluded" })] },
      { rowId: "p1.b2.r1", items: [labelItem("p1.b2.r1", "due_candidate", "due_candidate", { dueScope: "with_balance", optionalScope: "excluded" })] },
    ],
  };
  const result = core.processReceiptBundle(indexed, classificationInput).documents[0].result;
  const strength = result.reconciliations.find((entry) => entry.equation === "E2").closureStrength;
  assert.equal(strength.rating, "strong");
  assert.deepEqual(strength.signals, ["independent_due_repeat"]);
  assert.equal(result.draft.decision, "confirmed_draft");
});

test("reusing the same due source cell cannot create an independent signal", () => {
  const rows = [[{ text: "Период" }, { text: "09.2026" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "К оплате" }, { text: "100,00" }]];
  const duplicateDue = item(2, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" });
  const indexed = core.indexLiteralDocument(document(rows));
  const validated = core.validateRoleClassification(indexed.document, classification([
    { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] }, { items: [duplicateDue, structuredClone(duplicateDue)] },
  ]));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "numeric_token_already_owned"));
  const result = core.reconcileReceipt(core.buildCanonicalReceipt(indexed, validated.documents[0]));
  const strength = result.reconciliations.find((entry) => entry.equation === "E2").closureStrength;
  assert.equal(strength.rating, "weak");
  assert.ok(!strength.signals.includes("independent_due_repeat"));
});

test("closing balance is an E2 target, not an extra closure component", () => {
  const rows = [[{ text: "Период" }, { text: "09.2026" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Сальдо" }, { text: "+100,00" }], [{ text: "К оплате" }, { text: "100,00" }]];
  const roles = [{ items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] }, { items: [item(2, "closing_balance", 1, [[1]])] }, { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] }];
  const result = finish(rows, roles).result;
  const strength = result.reconciliations.find((entry) => entry.equation === "E2").closureStrength;
  assert.equal(strength.componentCount, 1);
  assert.equal(strength.rating, "weak");
  assert.equal(result.draft.decision, "partial_draft");
});

test("money parser handles explicit negative wrappers and preserves ambiguous separators", () => {
  assert.equal(core.parseMoneyLiteralToMinor("(1 234,56)"), -123456n);
  assert.equal(core.parseMoneyLiteralToMinor("1 234,56-"), -123456n);
  assert.equal(core.parseMoneyLiteralToMinor("1.234"), null);
  assert.equal(core.parseNumericLiteral("1.234").interpretation, "ambiguous_separator");
});

test("parentheses and trailing minus retain their sign through the full pipeline", () => {
  for (const printed of ["(1 234,56)", "1 234,56-"]) {
    const rows = [
      [{ text: "Период" }, { text: "09.2031" }], [{ text: "Начислено" }, { text: "2 000,00" }],
      [{ text: "Оплата" }, { text: printed }], [{ text: "К оплате" }, { text: "765,44" }],
    ];
    const roles = [
      { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
      { items: [item(2, "payment", 1, [[1]])] },
      { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
    ];
    const { indexed, result } = finish(rows, roles);
    const token = indexed.document.pages[0].blocks[0].rows[2].cells[1].numericTokens[0];
    assert.equal(token.raw, printed);
    assert.equal(token.printedSign, "minus");
    assert.equal(result.receipt.financialComponents.find((entry) => entry.role === "payment").amountMinor, -123456n);
    assert.equal(result.mandatoryDue.status, "confirmed");
    assert.equal(result.mandatoryDue.valueMinor, 76544n);
  }
});

test("typographic minus signs are literal only when directly prefixed to a number", () => {
  for (const printed of ["−50,00", "–50,00"]) {
    const rows = [
      [{ text: "Период" }, { text: "09.2031" }], [{ text: "Начислено" }, { text: "100,00" }],
      [{ text: "Начальное сальдо" }, { text: printed }], [{ text: "К оплате" }, { text: "50,00" }],
    ];
    const roles = [
      { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
      { items: [item(2, "opening_balance", 1, [[1]])] },
      { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
    ];
    const first = finish(rows, roles);
    const second = core.indexLiteralDocument(document(rows));
    const token = first.indexed.document.pages[0].blocks[0].rows[2].cells[1].numericTokens[0];
    assert.equal(token.raw, printed);
    assert.equal(token.printedSign, "minus");
    assert.equal(core.decimalToMinorExact(token), -5000n);
    assert.equal(token.id, second.document.pages[0].blocks[0].rows[2].cells[1].numericTokens[0].id);
    assert.equal(first.indexed.document.pages[0].blocks[0].rows[2].normalizedTextHash, second.document.pages[0].blocks[0].rows[2].normalizedTextHash);
    assert.equal(first.result.mandatoryDue.valueMinor, 5000n);
  }
  assert.ok(core.extractNumericTokens("cell", "Услуга – пояснение 10,00").every((token) => token.printedSign === "none"));
  assert.ok(core.extractNumericTokens("cell", "01.09.2026 – 30.09.2026").every((token) => token.printedSign === "none"));
  assert.ok(core.extractNumericTokens("cell", "01.09.2026–30.09.2026").every((token) => token.printedSign === "none"));
  assert.ok(core.extractNumericTokens("cell", "Услуга–30,00").every((token) => token.printedSign === "none"));
});

test("billing period uses a validated explicit text fragment and never falls back after an invalid range", () => {
  const text = "за июнь 2026 · Оплатить до 15.07.2026";
  const start = text.indexOf("июнь 2026");
  const periodItem = item(0, "billing_period");
  periodItem.slots.billing_period.textRange = { cellId: cellId(0, 1), start, end: start + "июнь 2026".length };
  const valid = finish([[{ text: "Период" }, { text }]], [{ items: [periodItem] }]);
  assert.equal(valid.result.receipt.period.value, "2026-06");
  assert.deepEqual(valid.result.receipt.period.sourceCellIds, [cellId(0, 1)]);

  const invalidItem = structuredClone(periodItem);
  invalidItem.slots.billing_period.textRange.end = text.length + 1;
  const indexed = core.indexLiteralDocument(document([[{ text: "Период" }, { text }], [{ text: "К оплате" }, { text: "100,00" }]]));
  const validated = core.validateRoleClassification(indexed.document, classification([
    { items: [invalidItem] },
    { items: [item(1, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ]));
  const result = core.reconcileReceipt(core.buildCanonicalReceipt(indexed, validated.documents[0]));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "invalid_text_range_reference"));
  assert.equal(result.receipt.period.value, null);
  assert.equal(result.receipt.period.parseStatus, "missing");
  assert.equal(result.draft.decision, "partial_draft");
});

test("E2 chooses only the candidate made mandatory by explicit optional and balance axes", () => {
  const optionalRows = [
    [{ text: "Период" }, { text: "09.2031" }], [{ text: "Начислено" }, { text: "100,00" }],
    [{ text: "Услуга" }, { text: "100,00" }], [{ text: "Страхование" }, { text: "10,00" }],
    [{ text: "К оплате" }, { text: "100,00" }], [{ text: "С услугой" }, { text: "110,00" }],
  ];
  const optionalRoles = [
    { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "service_charge", 1, [[1]])] }, { items: [item(3, "optional_charge", 1, [[1]])] },
    { items: [item(4, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
    { items: [item(5, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "included" })] },
  ];
  const optionalResult = finish(optionalRows, optionalRoles).result;
  assert.equal(optionalResult.mandatoryDue.status, "confirmed");
  assert.equal(optionalResult.mandatoryDue.valueMinor, 10000n);

  const balanceRows = [
    [{ text: "Период" }, { text: "09.2031" }], [{ text: "Начислено" }, { text: "100,00" }],
    [{ text: "Долг" }, { text: "20,00" }], [{ text: "За период" }, { text: "100,00" }],
    [{ text: "С долгом" }, { text: "120,00" }],
  ];
  const balanceRoles = [
    { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_debt", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
    { items: [item(4, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const balanceResult = finish(balanceRows, balanceRoles).result;
  assert.equal(balanceResult.mandatoryDue.status, "confirmed");
  assert.equal(balanceResult.mandatoryDue.valueMinor, 12000n);
});

test("E2 keeps unknown axes and equivalent candidates ambiguous", () => {
  const unknown = basicFinancialRows({ dueExtra: { dueScope: "unknown", optionalScope: "excluded" } });
  const unknownResult = finish(unknown.rows, unknown.roles).result;
  assert.equal(unknownResult.mandatoryDue.status, "needs_review");

  const rows = [[{ text: "Период" }, { text: "09.2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Итог 1" }, { text: "100,00" }], [{ text: "Итог 2" }, { text: "100,00" }]];
  const roles = [
    { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" })] },
  ];
  const result = finish(rows, roles).result;
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "ambiguous");
  assert.equal(result.mandatoryDue.status, "needs_review");
});

test("ambiguous dot notation remains addressable and review-only without changing literal identity", () => {
  const visual = document([
    [{ text: "Период" }, { text: "09.2031" }], [{ text: "Начислено" }, { text: "1.234" }],
    [{ text: "К оплате" }, { text: "1.234" }],
  ]);
  const first = core.indexLiteralDocument(visual);
  const second = core.indexLiteralDocument(structuredClone(visual));
  assert.deepEqual(first, second);
  const accruedToken = first.document.pages[0].blocks[0].rows[1].cells[1].numericTokens[0];
  assert.equal(accruedToken.id, tokenId(1, 1));
  assert.equal(accruedToken.raw, "1.234");
  assert.equal(accruedToken.interpretation, "ambiguous_separator");
  assert.equal(core.decimalToMinorExact(accruedToken), null);

  const rowHash = first.document.pages[0].blocks[0].rows[1].normalizedTextHash;
  const tokenIds = first.document.pages[0].blocks[0].rows.flatMap((row) => row.cells.flatMap((cell) => cell.numericTokens.map((token) => token.id)));
  const roles = [
    { items: [item(0, "billing_period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
  ];
  const validated = core.validateRoleClassification(first.document, classification(roles));
  const result = core.reconcileReceipt(core.buildCanonicalReceipt(first, validated.documents[0]));
  assert.equal(result.mandatoryDue.status, "absent");
  assert.equal(result.draft.decision, "partial_draft");
  assert.ok(result.receipt.diagnostics.some((entry) => entry.code === "money_token_missing"));
  assert.equal(first.document.pages[0].blocks[0].rows[1].normalizedTextHash, rowHash);
  assert.deepEqual(first.document.pages[0].blocks[0].rows.flatMap((row) => row.cells.flatMap((cell) => cell.numericTokens.map((token) => token.id))), tokenIds);
});

test("generator oracle exports literal structure and separates unavailable photo geometry", () => {
  const source = document([[{ text: "Заголовок", isHeader: true }, { text: "", state: "blank", colSpan: 2 }]], { layout: "table" });
  const oracle = core.exportGeneratorLiteral(source);
  const cell = oracle.literal.pages[0].blocks[0].rows[0].cells[1];
  assert.equal(oracle.source, "generator_export");
  assert.equal(cell.state, "blank");
  assert.equal(cell.colSpan, 2);
  assert.equal(cell.id, "p1.b1.r1.c2");
  assert.deepEqual(oracle.geometry, { status: "source", coordinateSpace: "generator-source-normalized" });
  const photo = core.exportGeneratorLiteral(source, { variant: "photo_telegram" });
  assert.deepEqual(photo.geometry, { status: "unavailable", reason: "photo_transform_missing" });
  assert.equal(photo.literal, null);
  assert.equal("bbox" in photo.contentStructure.pages[0].blocks[0], false);
  assert.equal("bbox" in photo.contentStructure.pages[0].blocks[0].rows[0].cells[0], false);
  assert.throws(() => core.exportGeneratorLiteral(source, { variant: "source", transformedDocument: source }), /source oracle cannot use transformed coordinates/u);
});

test("offline eval schema validates opaque metadata and deterministic fingerprint", () => {
  const fingerprint = core.deterministicDecisionFingerprint({ documents: [{ docId: "d1", decision: "partial_draft" }] });
  const record = core.validateReceiptEvalRecord({
    fileId: "fixture-opaque-1", documentIds: ["d1"], readerId: "reader-offline", classifierId: "classifier-offline",
    requestedModelId: "none", returnedModelId: "none", runNumber: 1, latencyMs: 0, estimatedCostMicrousd: 0,
    literalMetrics: { textPrecision: 1, textRecall: 1, numericPrecision: 1, numericRecall: 1, structureAccuracy: 1, geometryAccuracy: null },
    classificationMetrics: { rolePrecision: 1, roleRecall: 1, slotPrecision: 1, slotRecall: 1, segmentationAccuracy: 1 },
    geometryOracleStatus: "unavailable", documentCoverage: { expected: 1, produced: 1, matchedDocIds: ["d1"] },
    endToEndDecision: "pass", deterministicDecisionFingerprint: fingerprint,
  });
  assert.equal(record.deterministicDecisionFingerprint, fingerprint);
  assert.throws(() => core.validateReceiptEvalRecord({ ...record, deterministicDecisionFingerprint: "bad" }), /invalid_decision_fingerprint/u);
  assert.throws(() => core.validateReceiptEvalRecord({ ...record, literalMetrics: { ...record.literalMetrics, textPrecision: 1.01 } }), /invalid_receipt_eval_record/u);
  assert.throws(() => core.validateReceiptEvalRecord({ ...record, literalMetrics: { ...record.literalMetrics, numericRecall: Number.NaN } }), /invalid_receipt_eval_record/u);
  assert.throws(() => core.validateReceiptEvalRecord({ ...record, latencyMs: 1.5 }), /invalid_receipt_eval_record/u);
  assert.throws(() => core.validateReceiptEvalRecord({ ...record, documentIds: ["d1", "d1"] }), /invalid_receipt_eval_record/u);
  assert.throws(() => core.validateReceiptEvalRecord({ ...record, documentCoverage: { expected: 2, produced: 1, matchedDocIds: ["d1"] } }), /invalid_receipt_eval_record/u);
  assert.throws(() => core.validateReceiptEvalRecord({ ...record, endToEndDecision: "maybe" }), /invalid_receipt_eval_record/u);
  assert.throws(() => core.validateReceiptEvalRecord({ ...record, literalMetrics: { ...record.literalMetrics, geometryAccuracy: 1 } }), /geometry_oracle_unavailable/u);

  assert.equal(core.deterministicDecisionFingerprint({ a: 1, b: 2 }), core.deterministicDecisionFingerprint({ b: 2, a: 1 }));
  assert.notEqual(core.deterministicDecisionFingerprint({ value: 1n }), core.deterministicDecisionFingerprint({ value: "1" }));
  assert.equal(
    core.deterministicDecisionFingerprint({ documents: [{ docId: "b", value: 2 }, { docId: "a", value: 1 }] }),
    core.deterministicDecisionFingerprint({ documents: [{ docId: "a", value: 1 }, { docId: "b", value: 2 }] }),
  );
});
