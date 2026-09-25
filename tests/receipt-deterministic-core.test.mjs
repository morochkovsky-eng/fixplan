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
  penalty: "penalty", rounding: "rounding", due_candidate: "due_candidate", payment_history: "payment_history",
  meter_reading: "meter_curr", normative_reference: "normative", provider: "provider", account: "account",
  address: "address", period: "period", issue_date: "issue_date", due_date: "due_date",
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
  return {
    documentKind,
    tableSchemas,
    rows: rowEntries.map((entry, index) => ({
      rowId: entry.rowId ?? rowId(index),
      items: entry.items ?? [item(index, entry.role, 0, [])],
    })),
  };
}

function evaluate(rows, rowEntries, overrides = {}, documentKind = "utility", tableSchemas = []) {
  const indexed = core.indexLiteralDocument(document(rows, overrides));
  const validated = core.validateRoleClassification(indexed.document, classification(rowEntries, tableSchemas, documentKind));
  return { indexed, validated, receipt: core.buildCanonicalReceipt(indexed, validated) };
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
  const indexed = core.indexLiteralDocument(document([[{ text: "x" }]]));
  assert.throws(() => core.validateRoleClassification(indexed.document, { ...classification([{ role: "unknown" }]), documentKind: "invented" }), /unsupported value/u);
  assert.throws(() => core.validateRoleClassification(indexed.document, { documentKind: "utility", tableSchemas: [], rows: [{ rowId: rowId(0), role: "unknown", items: [] }] }), /not part of the contract/u);
});

test("references stay in their row and every row is classified once", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "A" }, { text: "1" }], [{ text: "B" }, { text: "2" }]]));
  const crossRow = item(0, "service_charge", 1, [[1]]);
  crossRow.slots.charge.cellIds = [cellId(1, 1)];
  const validated = core.validateRoleClassification(indexed.document, { documentKind: "utility", tableSchemas: [], rows: [{ rowId: rowId(0), items: [crossRow] }] });
  assert.ok(validated.diagnostics.some((entry) => entry.code === "invalid_cell_reference"));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "row_classification_missing" && entry.rowId === rowId(1)));
});

test("duplicate token ownership rejects all conflicting valid rows", () => {
  const indexed = core.indexLiteralDocument(document([[{ text: "Итого" }, { text: "100,00" }]]));
  const first = item(0, "due_candidate", 1, [[1]], { dueScope: "with_balance", optionalScope: "excluded" });
  const second = item(0, "accrued_total", 1, [[1]]);
  const validated = core.validateRoleClassification(indexed.document, classification([{ items: [first, second] }]));
  assert.ok(validated.diagnostics.some((entry) => entry.code === "numeric_token_already_owned"));
  assert.equal(validated.items.length, 0);
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
  assert.deepEqual(forward.items.map((entry) => entry.role), ["due_candidate"]);
  assert.deepEqual(reversed.items.map((entry) => entry.role), ["due_candidate"]);
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
    documentKind: "utility",
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
  assert.equal(validated.items.length, 0);
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
  assert.equal(finish(rows, roles).result.mandatoryDue.valueMinor, -5000n);
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
  assert.equal(result.draft.decision, "partial_draft");
});

test("exactly one optional-excluded candidate that closes E2 can be confirmed", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Страховка" }, { text: "20,00" }], [{ text: "Обязательно" }, { text: "100,00" }], [{ text: "Другой итог" }, { text: "130,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "optional_charge", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "excluded" })] },
    { items: [item(4, "due_candidate", 1, [[1]], { dueScope: "period_only", optionalScope: "included" })] },
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

test("zero balance makes period-only and with-balance formulas materially equivalent", () => {
  const rows = [[{ text: "Период" }, { text: "Август 2031" }], [{ text: "Начислено" }, { text: "100,00" }], [{ text: "Баланс" }, { text: "0,00" }], [{ text: "К оплате" }, { text: "100,00" }]];
  const roles = [
    { items: [item(0, "period")] }, { items: [item(1, "accrued_total", 1, [[1]])] },
    { items: [item(2, "opening_balance", 1, [[1]])] },
    { items: [item(3, "due_candidate", 1, [[1]], { dueScope: "unknown", optionalScope: "excluded" })] },
  ];
  const result = finish(rows, roles).result;
  assert.equal(result.reconciliations.find((entry) => entry.equation === "E2").status, "closed");
  assert.equal(result.mandatoryDue.status, "confirmed");
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
  assert.equal(result.computedDue, 10000n);
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
  const forward = core.buildCanonicalReceipt(indexed, core.validateRoleClassification(indexed.document, { documentKind: "utility", tableSchemas: [], rows: [{ rowId: rowId(0), items: [accrued, debt] }, { rowId: rowId(1), items: [due] }] }));
  const reverse = core.buildCanonicalReceipt(indexed, core.validateRoleClassification(indexed.document, { documentKind: "utility", tableSchemas: [], rows: [{ rowId: rowId(1), items: [due] }, { rowId: rowId(0), items: [debt, accrued] }] }));
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
  assert.equal(core.buildCanonicalReceipt(indexed, validated).serviceLines.length, 1);
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
