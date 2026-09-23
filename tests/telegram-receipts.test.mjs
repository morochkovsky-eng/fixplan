import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
await import("tsx/esm");
process.env.OPENAI_API_KEY = "local-test-key";
process.env.TELEGRAM_RECEIPT_APARTMENT_ID = "apt-a";
const { runTelegramAssistant } = await import("../lib/server/telegram-assistant.ts");
const { replyForDocument, replyForUpdate, isExplicitDraftRequest, matchReceiptApartment, receiptGrouping, mandatoryTotalCents } = await import("../lib/server/telegram-receipt-state.ts");
const { utilityDraftReply } = await import("../lib/server/assistant-replies.ts");

const owner = { telegram_user_id: 7, owner_user_id: "owner", owner_email: "owner@example.invalid", default_apartment_id: "apt-a", display_name: "Owner" };
const apartments = [
  { id: "apt-a", name: "A", address: "ул. Тестовая, д. 5, кв. 2", currency: "RUB", timezone: "Europe/Moscow", utility_insurance_included: false, locale: "ru" },
  { id: "apt-b", name: "B", address: "ул. Тестовая, д. 7, кв. 3", currency: "RUB", timezone: "Europe/Moscow", utility_insurance_included: false, locale: "ru" },
];

function database(available = apartments) {
  const rows = {
    apartment_members: available.map((item) => ({ apartment_id: item.id, user_id: "owner", email: owner.owner_email, role: "owner" })),
    apartments: available.map((item) => ({ ...item })),
    telegram_conversations: [],
    utility_bills: [],
  };
  const removed = [];
  const moved = [];
  return {
    rows,
    removed,
    moved,
    storage: { from() { return {
      async remove(paths) { removed.push(...paths); return { error: null }; },
      async move(source, destination) { moved.push({ source, destination }); return { error: null }; },
    }; } },
    from(table) {
      rows[table] ??= [];
      let action = "select", values = null;
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push((row) => String(row[key]) === String(value)); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        ilike(key, value) { filters.push((row) => String(row[key]).toLowerCase().startsWith(String(value).replace(/%$/u, "").toLowerCase())); return query; },
        neq(key, value) { filters.push((row) => String(row[key]) !== String(value)); return query; },
        order() { return query; },
        limit() { return query; },
        update(next) { action = "update"; values = next; return query; },
        insert(next) { action = "insert"; values = next; return query; },
        upsert(next) { action = "upsert"; values = next; return query; },
        single() { return execute(true); },
        maybeSingle() { return execute(true); },
        then(resolve) { return execute(false).then(resolve); },
      };
      async function execute(single) {
        let matches = (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        if (action === "insert") {
          const inserted = (Array.isArray(values) ? values : [values]).map((value) => ({ ...value, id: value.id ?? `${table}-${rows[table].length + 1}` }));
          rows[table].push(...inserted);
          matches = inserted;
        } else if (action === "upsert") {
          let item = rows[table].find((row) => row.telegram_user_id === values.telegram_user_id);
          if (!item) { item = {}; rows[table].push(item); }
          Object.assign(item, values);
          matches = [item];
        } else if (action === "update") {
          matches.forEach((item) => Object.assign(item, values));
        }
        return { data: single ? matches[0] ?? null : matches, error: null };
      }
      return query;
    },
  };
}

function attachment(updateId, fingerprint = updateId.toString(16).padStart(64, "a")) {
  return {
    dataUrl: "data:application/pdf;base64,VEVTVA==",
    filename: "receipt.pdf",
    mimeType: "application/pdf",
    storagePath: `apt-a/telegram/inbox/${fingerprint}-${updateId}-receipt.pdf`,
    fingerprint,
  };
}

function billCall({ service = "Электричество", address = apartments[0].address, period = "Март 2026", periodMonth = "2026-03", amount = "100.00", optional = "0.00", kind = "electricity", provider = "Поставщик", dueDate = "", openingDebt = "", lineItems = [], meters = [] } = {}) {
  return {
    type: "function_call", name: "prepare_utility_bill", call_id: "call-1",
    arguments: JSON.stringify({
      service, documentAddress: address, documentKind: kind, providerName: provider, accountNumber: "0001", period, periodMonth,
      documentDate: "", dueDate, periodChargeAmount: String(amount), openingDebtAmount: openingDebt, openingCreditAmount: "",
      paidAmount: "", recalculationAmount: "", benefitAmount: "", penaltyAmount: "",
      mandatoryDueAmount: String(amount), printedDueAmount: String(amount), allocation: "tenant", lineItems, meters,
      optionalCharges: Number(optional) > 0 ? [{ label: "Добровольная услуга", kind: "insurance", amount: String(optional), includedInMandatory: false }] : [],
      warnings: [], note: "",
    }),
  };
}

async function run(db, updateId, calls = []) {
  const originalFetch = globalThis.fetch;
  let step = 0;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (step === 0) {
      assert.equal(payload.previous_response_id, undefined);
      assert.doesNotMatch(JSON.stringify(payload.input), /Текущий неподтверждённый черновик/);
      assert.doesNotMatch(payload.instructions, /адрес: ул\. Тестовая/);
    }
    const output = step++ === 0 ? calls : [];
    return Response.json({ id: `response-${updateId}-${step}`, output, output_text: output.length ? "" : "Непроверенный ответ модели" });
  };
  try {
    return await runTelegramAssistant(db, owner, "", "https://example.invalid", attachment(updateId), { updateId });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runText(db, updateId, message, calls = []) {
  const originalFetch = globalThis.fetch;
  let step = 0;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    if (step === 0 && !isExplicitDraftRequest(message)) {
      assert.equal(payload.input, message);
      assert.doesNotMatch(JSON.stringify(payload.input), /Текущий неподтверждённый черновик/);
    }
    const output = step++ === 0 ? calls : [];
    return Response.json({ id: `text-${updateId}-${step}`, output, output_text: output.length ? "" : `Ответ на: ${message}` });
  };
  try {
    return await runTelegramAssistant(db, owner, message, "https://example.invalid", undefined, { updateId });
  } finally { globalThis.fetch = originalFetch; }
}

test("an old utility pending cannot replace an unrelated text reply or attach its buttons", async () => {
  const db = database();
  await run(db, 701, [billCall()]);
  const before = structuredClone(db.rows.telegram_conversations[0].pending_action);
  const answer = await runText(db, 702, "Как дела сегодня?");
  const shown = replyForUpdate(answer, db.rows.telegram_conversations[0].pending_action, before);
  assert.equal(shown.text, "Ответ на: Как дела сегодня?");
  assert.equal(shown.pending, null);
  assert.deepEqual(db.rows.telegram_conversations[0].pending_action, before);
  assert.equal(db.rows.utility_bills.length, 1);
});

test("a utility draft prepared by this text update appears once with the current action", async () => {
  const db = database();
  const before = null;
  const answer = await runText(db, 703, "Добавь коммунальный счёт", [billCall()]);
  const shown = replyForUpdate(answer, db.rows.telegram_conversations[0].pending_action, before);
  assert.equal(shown.pending.type, "create_utility_bill");
  assert.match(utilityDraftReply(shown.pending, "RUB", "Europe/Moscow"), /Электричество/);
  assert.equal(db.rows.utility_bills.length, 1);
});

test("a newly prepared non-utility action cannot surface the older utility receipt", async () => {
  const db = database();
  await run(db, 704, [billCall()]);
  const before = structuredClone(db.rows.telegram_conversations[0].pending_action);
  const answer = await runText(db, 705, "Запланируй уборку", [{
    type: "function_call", name: "prepare_cleaning", call_id: "cleaning-1",
    arguments: JSON.stringify({ title: "Тестовая уборка", scheduledAt: "2026-10-01T10:00:00", cleaner: "Тест", zones: ["кухня"], checklist: ["Убрать кухню"] }),
  }]);
  const shown = replyForUpdate(answer, db.rows.telegram_conversations[0].pending_action, before);
  assert.equal(shown.pending?.type, "create_cleaning");
  assert.doesNotMatch(shown.text, /Электричество|100/);
});

test("a current pending callback confirms without displaying an obsolete draft", async () => {
  const db = database();
  await run(db, 706, [billCall()]);
  const before = structuredClone(db.rows.telegram_conversations[0].pending_action);
  const answer = await runTelegramAssistant(db, owner, "создавай", "https://example.invalid");
  const shown = replyForUpdate(answer, db.rows.telegram_conversations[0].pending_action, before);
  assert.equal(shown.pending?.type, "send_utility_statement");
  assert.notDeepEqual(shown.pending, before);
  assert.equal(db.rows.utility_bills[0].status, "due");
});

test("explicitly viewing the pending draft remains possible without changing it", async () => {
  const db = database();
  await run(db, 707, [billCall()]);
  const before = structuredClone(db.rows.telegram_conversations[0].pending_action);
  const message = "Покажи текущий черновик";
  assert.equal(isExplicitDraftRequest(message), true);
  const answer = await runText(db, 708, message);
  const shown = replyForUpdate(answer, db.rows.telegram_conversations[0].pending_action, before, isExplicitDraftRequest(message));
  assert.equal(shown.pending?.type, "create_utility_bill");
  assert.deepEqual(db.rows.telegram_conversations[0].pending_action, before);
});

test("T05 then T06: no tool call cannot reuse the earlier draft or create another bill", async () => {
  const db = database();
  const first = await run(db, 105, [billCall()]);
  assert.equal(first.state, "prepared");
  assert.equal(db.rows.utility_bills.length, 1);
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  let second;
  try { second = await run(db, 106); } finally { console.warn = originalWarn; }
  assert.equal(second.state, "unrecognized");
  assert.deepEqual(warnings, [["telegram_document_unrecognized", { update_id: 106, reason: "no_tool_call" }]]);
  assert.equal(db.rows.utility_bills.length, 1);
  assert.equal(db.rows.telegram_conversations[0].pending_action, null);
  const sent = replyForDocument(second, db.rows.telegram_conversations[0].pending_action);
  assert.match(sent.text, /не удалось уверенно распознать/i);
  assert.doesNotMatch(sent.text, /Электричество|100/);
  assert.equal(sent.pending, null);
});

test("T07 then T08: an unreadable PDF cannot repeat the previous reply", async () => {
  const db = database();
  await run(db, 107, [billCall({ service: "Капремонт", amount: 636.48 })]);
  const second = await run(db, 108);
  assert.equal(second.state, "unrecognized");
  assert.equal(db.rows.utility_bills.length, 1);
  assert.equal(db.rows.telegram_conversations[0].pending_action, null);
  assert.equal(replyForDocument(second, db.rows.telegram_conversations[0].pending_action).pending, null);
});

test("different receipts for one apartment and month stay separate and form one mandatory summary", async () => {
  const db = database();
  await run(db, 201, [billCall({ service: "Электричество", amount: 100 })]);
  const second = await run(db, 202, [billCall({ service: "ЖКУ", amount: 200, optional: 30 })]);
  assert.equal(second.state, "prepared");
  assert.equal(db.rows.utility_bills.length, 2);
  assert.notEqual(db.rows.utility_bills[0].id, db.rows.utility_bills[1].id);
  const pending = db.rows.telegram_conversations[0].pending_action;
  assert.equal(pending.payload.items.length, 2);
  assert.equal(mandatoryTotalCents(pending.payload.items), 30000n);
  assert.match(utilityDraftReply(pending, "RUB", "Europe/Moscow"), /300,00/);
});

test("single-object receipt mode ignores a different printed address and keeps the stable apartment", async () => {
  const db = database();
  await run(db, 301, [billCall({ amount: 100 })]);
  await run(db, 302, [billCall({ address: apartments[1].address, service: "ЖКУ", amount: 200 })]);
  assert.equal(db.rows.utility_bills.length, 2);
  assert.equal(db.rows.utility_bills[0].apartment_id, "apt-a");
  assert.equal(db.rows.utility_bills[1].apartment_id, "apt-a");
  assert.equal(db.rows.telegram_conversations[0].pending_action.payload.items.length, 2);
  assert.equal(db.moved.length, 0);
  assert.equal(db.rows.utility_bills[1].document_address, apartments[1].address);
  assert.match(db.rows.utility_bills[1].receipt_storage_path, /^apt-a\//u);
});

test("uploading the same receipt again does not double the bill", async () => {
  const db = database();
  await run(db, 401, [billCall()]);
  const repeated = attachment(402, attachment(401).fingerprint);
  const originalFetch = globalThis.fetch;
  let step = 0;
  globalThis.fetch = async () => Response.json({ id: `duplicate-${++step}`, output: step === 1 ? [billCall()] : [], output_text: "" });
  try {
    const result = await runTelegramAssistant(db, owner, "", "https://example.invalid", repeated, { updateId: 402 });
    assert.equal(result.state, "duplicate");
    assert.equal(replyForDocument(result, db.rows.telegram_conversations[0].pending_action).pending, null);
    assert.equal(db.rows.utility_bills.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("same provider/month with different content is not silently replaced", async () => {
  const db = database();
  await run(db, 501, [billCall()]);
  const correction = await run(db, 502, [billCall({ amount: 110 })]);
  assert.equal(correction.state, "possible_correction");
  assert.match(correction.text, /отправьте.*повторно/i);
  assert.match(correction.text, /ответ «да» ничего не заменит/i);
  assert.equal(db.rows.utility_bills.length, 1);
  assert.equal(db.rows.telegram_conversations[0].pending_action, null);
  assert.deepEqual(db.removed, [attachment(502).storagePath]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: "after-correction", output: [], output_text: "Текстовый ответ не заменяет документ" });
  try {
    await runTelegramAssistant(db, owner, "да", "https://example.invalid");
    assert.equal(db.rows.utility_bills.length, 1);
    assert.equal(db.rows.utility_bills[0].status, "draft");
  } finally { globalThis.fetch = originalFetch; }
});

test("a normalized exact address binds to exactly one accessible apartment", () => {
  assert.deepEqual(matchReceiptApartment("улица Тестовая, дом 5, квартира 2", apartments), { kind: "matched", apartment: apartments[0] });
  assert.deepEqual(matchReceiptApartment("", apartments), { kind: "missing" });
  assert.deepEqual(matchReceiptApartment(apartments[0].address, [apartments[0], { ...apartments[0], id: "copy" }]), { kind: "ambiguous" });
});

test("single-object mode stores a missing or ambiguous document address only as reference", async () => {
  for (const [available, address] of [[apartments, ""], [[apartments[0], { ...apartments[0], id: "copy" }], apartments[0].address]]) {
    const db = database(available);
    const result = await run(db, 601, [billCall({ address })]);
    assert.equal(result.state, "prepared");
    assert.equal(db.rows.utility_bills.length, 1);
    assert.equal(db.rows.utility_bills[0].apartment_id, "apt-a");
  }
});

test("grouping rejects different objects and exact repeated fingerprints", () => {
  const item = { apartmentId: "apt-a", period: "Март 2026", service: "ЖКУ", sourceFingerprint: "a".repeat(64), periodChargeAmount: 100 };
  assert.equal(receiptGrouping([item], [], { apartmentId: "apt-b", period: "Март 2026", service: "ЖКУ", fingerprint: "b".repeat(64) }).items.length, 0);
  assert.equal(receiptGrouping([item], [], { apartmentId: "apt-a", period: "Март 2026", service: "ЖКУ", fingerprint: "a".repeat(64) }).decision, "duplicate");
  assert.equal(receiptGrouping([{ ...item, period: "Март 2026 (с 01.03.2026 по 31.03.2026)" }], [], { apartmentId: "apt-a", period: "Март 2026", service: "Электричество", fingerprint: "b".repeat(64) }).items.length, 1);
});

test("a moved receipt stays addressable by the object's storage policy and signed URL readers", () => {
  const policy = readFileSync("supabase/schema.sql", "utf8");
  const appData = readFileSync("app/api/app-data/route.ts", "utf8");
  const billRoute = readFileSync("app/api/utility-bills/[id]/route.ts", "utf8");
  assert.match(policy, /is_apartment_member\(\(storage\.foldername\(name\)\)\[1\]::uuid\)/);
  assert.match(appData, /createSignedUrl\(bill\.receipt_storage_path,/);
  assert.match(billRoute, /createSignedUrl\(data\.receipt_storage_path,/);
});

test("configured receipt apartment must exist and belong to the Telegram owner", async () => {
  const previous = process.env.TELEGRAM_RECEIPT_APARTMENT_ID;
  process.env.TELEGRAM_RECEIPT_APARTMENT_ID = "not-owned";
  try {
    const db = database();
    const result = await run(db, 801, [billCall()]);
    assert.equal(result.state, "unrecognized");
    assert.equal(db.rows.utility_bills.length, 0);
    assert.deepEqual(db.removed, [attachment(801).storagePath]);
  } finally {
    process.env.TELEGRAM_RECEIPT_APARTMENT_ID = previous;
  }
});

test("a missing billing month keeps the document and accepts a later month without re-upload", async () => {
  const db = database();
  const result = await run(db, 802, [billCall({ period: "", periodMonth: "", amount: "50.00" })]);
  assert.equal(result.state, "prepared");
  assert.equal(db.rows.telegram_conversations[0].pending_action.type, "collect_utility_bill");
  assert.equal(db.rows.utility_bills.length, 1);
  assert.match(utilityDraftReply(db.rows.telegram_conversations[0].pending_action, "RUB", "Europe/Moscow"), /повторно загружать документ не нужно/i);
  const answer = await runTelegramAssistant(db, owner, "август 2026", "https://example.invalid");
  assert.match(answer, /период сохранён/i);
  assert.equal(db.rows.telegram_conversations[0].pending_action.type, "create_utility_bill");
  assert.equal(db.rows.utility_bills[0].billing_period_month, "2026-08-01");
  assert.equal(db.rows.utility_bills[0].period, "Август 2026");
});

test("T05-T07 remain separate August drafts with an exact 5218.56 monthly total", async () => {
  const db = database();
  await run(db, 905, [billCall({
    service: "Электричество", kind: "electricity", period: "Август 2026", periodMonth: "2026-08", amount: "1419.05", optional: "385.00", dueDate: "2026-09-15",
    lineItems: [
      { name: "Электроэнергия день", unit: "кВт·ч", volume: "197.27", tariff: "6.08", chargeAmount: "1199.40", recalculationAmount: "", benefitAmount: "", totalAmount: "1199.40" },
      { name: "Электроэнергия ночь", unit: "кВт·ч", volume: "66.36", tariff: "3.31", chargeAmount: "219.65", recalculationAmount: "", benefitAmount: "", totalAmount: "219.65" },
    ],
    meters: [
      { resource: "Электроэнергия день", meterNumber: "E-1", previousValue: "16256", currentValue: "", consumption: "", unit: "кВт·ч", tariff: "6.08" },
      { resource: "Электроэнергия ночь", meterNumber: "E-1", previousValue: "6253", currentValue: "", consumption: "", unit: "кВт·ч", tariff: "3.31" },
    ],
  })]);
  const housingLines = [
    ["Водоотведение ХВС ОДН", "12.20"], ["Водоотведение ГВС ОДН", "7.54"], ["ХВС ОДН", "12.20"],
    ["ГВС ОДН", "25.87"], ["Коммунальное освещение", "111.15"], ["Вывоз мусора", "259.35"],
    ["АППЗ", "39.00"], ["АУР", "343.20"], ["Диспетчеризация", "417.30"], ["Лифт", "222.30"],
    ["ПЗУ и видеонаблюдение", "46.80"], ["Содержание домохозяйства", "177.45"], ["Содержание территории", "269.10"],
    ["Текущий ремонт", "705.90"], ["Техническое обслуживание", "142.35"], ["ТО КУУ тепла", "42.90"],
    ["Уборка лестничных клеток", "132.60"], ["Кабельное телевидение", "180.00"], ["Ведение расчётного счёта", "15.82"],
  ];
  await run(db, 906, [billCall({
    service: "ЖКУ", kind: "housing", period: "Август 2026", periodMonth: "2026-08", amount: "3163.03", dueDate: "2026-09-25",
    lineItems: housingLines.map(([name, totalAmount]) => ({ name, unit: "", volume: "", tariff: "", chargeAmount: totalAmount, recalculationAmount: "", benefitAmount: "", totalAmount })),
    meters: Array.from({ length: 4 }, (_, index) => ({ resource: `Счётчик ${index + 1}`, meterNumber: `M-${index + 1}`, previousValue: "", currentValue: "", consumption: "", unit: "", tariff: "" })),
  })]);
  await run(db, 907, [billCall({
    service: "Капитальный ремонт", kind: "capital_repair", period: "Август 2026", periodMonth: "2026-08", amount: "636.48", openingDebt: "0.00", dueDate: "2026-09-25",
    lineItems: [{ name: "Капитальный ремонт", unit: "м²", volume: "39", tariff: "16.32", chargeAmount: "636.48", recalculationAmount: "", benefitAmount: "", totalAmount: "636.48" }],
  })]);
  assert.equal(db.rows.utility_bills.length, 3);
  assert.equal(new Set(db.rows.utility_bills.map((row) => row.source_update_id)).size, 3);
  assert.equal(new Set(db.rows.utility_bills.map((row) => row.receipt_storage_path)).size, 3);
  assert.equal(mandatoryTotalCents(db.rows.telegram_conversations[0].pending_action.payload.items), 521856n);
  assert.equal(db.rows.utility_bill_line_items.length, 22);
  assert.equal(db.rows.utility_bill_meter_entries.length, 6);
  assert.equal(db.rows.utility_bill_optional_charges.length, 1);
  assert.equal(db.rows.utility_bill_optional_charges[0].included_in_mandatory, false);
  assert.equal(db.rows.utility_bill_line_items.filter((row) => row.utility_bill_id === db.rows.utility_bills[1].id).reduce((sum, row) => sum + BigInt(row.total_minor), 0n), 316303n);
  assert.equal(db.rows.utility_bills[0].due_date, "2026-09-15");
  assert.equal(db.rows.utility_bills[1].due_date, "2026-09-25");
  assert.equal(db.rows.utility_bill_meter_entries[0].current_value, null);
  assert.equal(db.rows.utility_bill_meter_entries[1].current_value, null);
  assert.equal(db.rows.utility_bills[2].opening_debt_minor, "0");
  assert.equal(db.rows.utility_bills[2].due_date, "2026-09-25");
});

test("T08 keeps debt, payment, recalculation and penalty separate from printed due", async () => {
  const db = database();
  const call = billCall({ service: "ЖКУ", kind: "housing", period: "Май 2026", periodMonth: "2026-05", amount: "14995.84" });
  const args = JSON.parse(call.arguments);
  Object.assign(args, {
    periodChargeAmount: "14405.63",
    openingDebtAmount: "75590.21",
    paidAmount: "75000.00",
    recalculationAmount: "-256.17",
    penaltyAmount: "80.14",
    mandatoryDueAmount: "14995.84",
    printedDueAmount: "14995.84",
    dueDate: "2026-06-15",
  });
  call.arguments = JSON.stringify(args);
  await run(db, 908, [call]);
  const row = db.rows.utility_bills[0];
  assert.equal(row.period_charge_minor, "1440563");
  assert.equal(row.opening_debt_minor, "7559021");
  assert.equal(row.paid_minor, "7500000");
  assert.equal(row.recalculation_minor, "-25617");
  assert.equal(row.penalty_minor, "8014");
  assert.equal(row.mandatory_due_minor, "1499584");
  assert.equal(row.arithmetic_difference_minor, "0");
  assert.equal(row.billing_period_month, "2026-05-01");
  assert.equal(row.due_date, "2026-06-15");
});
