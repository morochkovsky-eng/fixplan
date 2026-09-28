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
    quality: { sourceType: "document", mediaKind: "pdf", byteSize: 4, width: null, height: null, pageCount: 1, sharpness: null, brightness: null, contrast: null, brightPixelRatio: null, darkPixelRatio: null, textRegionSharpness: null, textRegionContrast: null, contentCoverage: null, autoOrientationApplied: false, analysisError: null },
  };
}

function readableQuality(overrides = {}) {
  return {
    readable: true,
    issues: [],
    criticalFields: [
      ["document_kind", "Квитанция"], ["billing_period", "Март 2026"],
      ["period_charge", "Начислено 100,00"], ["mandatory_due", "К оплате 100,00"],
      ["due_date", null], ["provider", "Поставщик"],
    ].map(([field, evidence]) => ({ field, confidence: evidence ? "high" : "absent", evidence })),
    ...overrides,
  };
}

function billCall({ service = "Электричество", address = apartments[0].address, period = "Март 2026", periodMonth = "2026-03", amount = "100.00", optional = "0.00", kind = "electricity", provider = "Поставщик", dueDate = "", openingDebt = "", lineItems = [], meters = [] } = {}) {
  return {
    type: "function_call", name: "prepare_utility_bill", call_id: "call-1",
    arguments: JSON.stringify({
      service, documentAddress: address, documentKind: kind, providerName: provider, accountNumber: "0001", period, periodMonth,
      documentDate: "", dueDate, periodChargeAmount: String(amount), openingDebtAmount: openingDebt, openingCreditAmount: "",
      paidAmount: "", recalculationAmount: "", benefitAmount: "", penaltyAmount: "",
      mandatoryDueAmount: String(amount), printedDueAmount: String(amount), allocation: "tenant",
      lineItems: lineItems.map((item) => ({ calculationMode: "printed_total", ...item })),
      meters,
      optionalCharges: Number(optional) > 0 ? [{ label: "Добровольная услуга", kind: "insurance", amount: String(optional), includedInMandatory: false }] : [],
      warnings: [], note: "", quality: readableQuality(),
    }),
  };
}

async function run(db, updateId, calls = [], currentAttachment = attachment(updateId)) {
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
    return await runTelegramAssistant(db, owner, "", "https://example.invalid", currentAttachment, { updateId });
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

async function runWithResponses(db, updateId, responses, currentAttachment) {
  const originalFetch = globalThis.fetch;
  const payloads = [];
  let step = 0;
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(init.body));
    const output = responses[step++] ?? [];
    return Response.json({ id: `sequence-${updateId}-${step}`, output, output_text: output.length ? "" : "Результат обработан" });
  };
  try {
    const result = await runTelegramAssistant(db, owner, "", "https://example.invalid", currentAttachment, { updateId });
    return { result, payloads };
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

test("a recognized receipt followed by an unrecognized attachment cannot reuse the earlier draft", async () => {
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
  assert.match(sent.text, /не удалось подтвердить/i);
  assert.doesNotMatch(sent.text, /Электричество|100/);
  assert.equal(sent.pending, null);
});

test("an unreadable PDF after another receipt cannot repeat the previous reply", async () => {
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

test("receipt processing fails closed when the apartment configuration is missing", async () => {
  const previous = process.env.TELEGRAM_RECEIPT_APARTMENT_ID;
  delete process.env.TELEGRAM_RECEIPT_APARTMENT_ID;
  try {
    const db = database();
    const result = await run(db, 803, [billCall()]);
    assert.equal(result.state, "unrecognized");
    assert.equal(db.rows.utility_bills.length, 0);
    assert.deepEqual(db.removed, [attachment(803).storagePath]);
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_RECEIPT_APARTMENT_ID;
    else process.env.TELEGRAM_RECEIPT_APARTMENT_ID = previous;
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

test("quality rejection creates no bill, pending action, or retained Storage object", async () => {
  const db = database();
  const call = billCall();
  const args = JSON.parse(call.arguments);
  Object.assign(args, {
    service: null, documentKind: null, providerName: null, periodMonth: null, period: null,
    dueDate: null, periodChargeAmount: null, mandatoryDueAmount: null, printedDueAmount: null,
    quality: readableQuality({
      readable: false,
      issues: ["blur", "compression", "small_text"],
      criticalFields: readableQuality().criticalFields.map((item) => ({ ...item, confidence: "unreadable", evidence: null })),
    }),
  });
  call.arguments = JSON.stringify(args);
  const current = {
    ...attachment(905),
    mimeType: "image/jpeg",
    filename: "compressed-photo.jpg",
    quality: { sourceType: "photo", mediaKind: "image", byteSize: 80_000, width: 200, height: 900, pageCount: 1, sharpness: 0.5, brightness: 35, contrast: 5, brightPixelRatio: 0.02, darkPixelRatio: 0.5, textRegionSharpness: 0.5, textRegionContrast: 5, contentCoverage: 0.2, autoOrientationApplied: false, analysisError: null },
  };
  const result = await run(db, 905, [call], current);
  assert.equal(result.state, "unrecognized");
  assert.equal(db.rows.utility_bills.length, 0);
  assert.equal(db.rows.telegram_conversations[0].pending_action, null);
  assert.deepEqual(db.removed, [current.storagePath]);
  assert.match(result.text, /оригинал как файл|более чёткое фото/i);

  const timeoutDb = database();
  const timeoutAttachment = attachment(906);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new DOMException("timed out", "TimeoutError"); };
  try {
    await assert.rejects(
      runTelegramAssistant(timeoutDb, owner, "", "https://example.invalid", timeoutAttachment, { updateId: 906 }),
      /timed out/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(timeoutDb.removed, [timeoutAttachment.storagePath]);
  assert.equal(timeoutDb.rows.telegram_conversations[0]?.pending_action ?? null, null);
});

test("a readable receipt gets exactly one targeted retry and then creates one draft", async () => {
  const db = database();
  const first = billCall({ service: "Капремонт", kind: "capital_repair", amount: "636.48", period: "Август 2026", periodMonth: "2026-08", dueDate: "2026-09-25", lineItems: [{ name: "Капитальный ремонт", unit: "м²", volume: "39", tariff: "16.32", chargeAmount: "636.48", recalculationAmount: "", benefitAmount: "", totalAmount: "636.48" }] });
  const firstArgs = JSON.parse(first.arguments);
  firstArgs.mandatoryDueAmount = null;
  firstArgs.printedDueAmount = null;
  firstArgs.quality.criticalFields = firstArgs.quality.criticalFields.map((item) => item.field === "mandatory_due"
    ? { ...item, confidence: "unreadable", evidence: null }
    : item);
  first.arguments = JSON.stringify(firstArgs);
  const second = billCall({ service: "Капремонт", kind: "capital_repair", amount: "636.48", period: "Август 2026", periodMonth: "2026-08", dueDate: "2026-09-25", lineItems: [{ name: "Капитальный ремонт", unit: "м²", volume: "39", tariff: "16.32", chargeAmount: "636.48", recalculationAmount: "", benefitAmount: "", totalAmount: "636.48" }] });
  second.call_id = "call-2";
  const current = {
    ...attachment(930),
    dataUrl: "data:image/jpeg;base64,UFJJTUFSWQ==",
    targetedDataUrls: ["data:image/jpeg;base64,VE9Q", "data:image/jpeg;base64,VEFCTEU=", "data:image/jpeg;base64,VE9UQUw="],
    mimeType: "image/jpeg",
    filename: "telegram-photo.jpg",
    quality: { sourceType: "photo", mediaKind: "image", byteSize: 120_000, width: 1280, height: 908, pageCount: 1, sharpness: 8, brightness: 179, contrast: 40, brightPixelRatio: 0, darkPixelRatio: 0.04, textRegionSharpness: 9, textRegionContrast: 44, contentCoverage: 0.55, autoOrientationApplied: false, analysisError: null },
  };
  const { result, payloads } = await runWithResponses(db, 930, [[first], [second], []], current);
  assert.equal(result.state, "prepared");
  assert.equal(db.rows.utility_bills.length, 1);
  assert.equal(db.rows.utility_bills[0].billing_period_month, "2026-08-01");
  assert.equal(db.rows.utility_bills[0].mandatory_due_minor, "63648");
  assert.equal(db.rows.utility_bill_line_items.length, 1);
  assert.equal(db.rows.utility_bill_line_items[0].volume, "39");
  assert.equal(db.rows.utility_bill_line_items[0].tariff, "16.32");
  assert.equal(payloads.length, 3);
  assert.equal(payloads[1].previous_response_id, undefined);
  const retryImages = payloads[1].input[0].content.filter((part) => part.type === "input_image");
  assert.equal(retryImages.length, 4);
  assert.ok(retryImages.every((part) => part.detail === "high"));
  assert.equal(db.rows.telegram_request_traces.length, 2);
  assert.equal(db.rows.telegram_request_traces[0].details.retry_scheduled, true);
  assert.equal(db.rows.telegram_request_traces[1].details.retry_scheduled, false);
});

test("an attachment without a receipt tool call does not start a speculative targeted retry", async () => {
  const db = database();
  const current = {
    ...attachment(931),
    dataUrl: "data:image/jpeg;base64,UFJJTUFSWQ==",
    targetedDataUrls: ["data:image/jpeg;base64,VE9Q"],
    mimeType: "image/jpeg",
  };
  const { result, payloads } = await runWithResponses(db, 931, [[], [billCall()]], current);
  assert.equal(result.state, "unrecognized");
  assert.equal(payloads.length, 1);
  assert.equal(db.rows.utility_bills.length, 0);
  assert.equal(db.rows.telegram_conversations[0].pending_action, null);
});

test("line totals and volume by tariff contradictions block persistence", async () => {
  for (const lineItems of [
    [{ name: "Услуга A", unit: "ед.", volume: "", tariff: "", chargeAmount: "80.00", recalculationAmount: "", benefitAmount: "", totalAmount: "80.00" }],
    [{ name: "Услуга B", unit: "м²", volume: "10", tariff: "3.00", calculationMode: "simple", chargeAmount: "40.00", recalculationAmount: "", benefitAmount: "", totalAmount: "100.00" }],
  ]) {
    const db = database();
    const result = await run(db, 910, [billCall({ amount: "100.00", lineItems })]);
    assert.equal(result.state, "unrecognized");
    assert.equal(db.rows.utility_bills.length, 0);
    assert.equal(db.rows.telegram_conversations[0].pending_action, null);
  }
});

test("a readable Telegram photo and an original document both pass the quality gate", async () => {
  for (const [updateId, current] of [
    [920, { ...attachment(920), mimeType: "image/jpeg", filename: "clear-photo.jpg", quality: { sourceType: "photo", mediaKind: "image", byteSize: 600_000, width: 1600, height: 2400, pageCount: 1, sharpness: 18, brightness: 142, contrast: 52, brightPixelRatio: 0.08, darkPixelRatio: 0.04, analysisError: null } }],
    [921, attachment(921)],
    [922, { ...attachment(922), mimeType: "image/png", filename: "original.png", quality: { sourceType: "document", mediaKind: "image", byteSize: 900_000, width: 1800, height: 2600, pageCount: 1, sharpness: 20, brightness: 138, contrast: 48, brightPixelRatio: 0.05, darkPixelRatio: 0.03, analysisError: null } }],
  ]) {
    const db = database();
    const result = await run(db, updateId, [billCall()], current);
    assert.equal(result.state, "prepared");
    assert.equal(db.rows.utility_bills.length, 1);
  }
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

function pipelineField(value, status = value === null ? "missing" : "confirmed", rawText = value === null ? null : String(value), sourceRegionIds = value === null ? [] : ["financial"]) {
  return { value, rawText, sourceRegionIds, status, reason: status === "confirmed" ? null : "not_printed" };
}

function pipelineReceipt(overrides = {}) {
  return {
    isUtilityDocument: pipelineField(true, "confirmed", "Квитанция", ["identity"]), documentType: pipelineField("housing", "confirmed", "Жилищные услуги", ["identity"]), provider: pipelineField(null), referenceAddress: pipelineField(null), accountNumber: pipelineField(null), billingPeriod: pipelineField("2026-08", "confirmed", "август 2026", ["period"]), issuedDate: pipelineField(null), dueDate: pipelineField(null),
    accruedAmount: pipelineField(316303), openingDebt: pipelineField(0), openingAdvance: pipelineField(0), paymentsAppliedToCurrentPeriod: pipelineField(0), recalculationAmount: pipelineField(0), benefitAmount: pipelineField(0), penaltyAmount: pipelineField(0), printedMandatoryDue: pipelineField(316303), mandatoryDue: pipelineField(316303), lastPayment: { amount: pipelineField(null), date: pipelineField(null) }, financialComponents: [], lineItems: [], meterEntries: [], optionalCharges: [], warnings: [], ...overrides,
  };
}

function pipelineExtractor(firstReceipt, fallbackReceipt = firstReceipt) {
  const bbox = { x: 0.1, y: 0.1, width: 0.5, height: 0.05 };
  const literal = { pages: [{ page: 1, rawText: "Квитанция", sections: [] }], regions: [{ id: "financial", page: 1, kind: "total", rawText: "К оплате 3163,03" }], keyValues: [], tables: [], totals: [], meters: [], evidence: [
    { id: "identity", page: 1, kind: "heading", sectionType: "identity", label: "Квитанция", value: "Жилищные услуги", rawText: "Квитанция Жилищные услуги", bbox, allowsMultipleEntities: true },
    { id: "period", page: 1, kind: "key_value", sectionType: "billing_period", label: "Период", value: "август 2026", rawText: "август 2026", bbox, allowsMultipleEntities: false },
    { id: "financial", page: 1, kind: "total", sectionType: "financial_summary", label: "К оплате", value: "3163,03 0,00", rawText: "Начислено 3163,03; долг 0,00; оплачено 0,00; перерасчёт 0,00; пени 0,00; к оплате 3163,03", bbox, allowsMultipleEntities: true },
  ] };
  let normalization = 0;
  return {
    provider: "test", transcriptionModel: "vision-test", normalizationModel: "text-test",
    async transcribe() { return { provider: "test", model: "vision-test", value: literal, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1, failureCode: null, responseId: "t1" }; },
    async transcribeFallback(input) { assert.ok(input.unresolvedFields.length > 0); return { provider: "test", model: "vision-test", value: literal, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1, failureCode: null, responseId: "t2" }; },
    async normalize() { return { provider: "test", model: "text-test", value: normalization++ === 0 ? firstReceipt : fallbackReceipt, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1, failureCode: null, responseId: "n" }; },
  };
}

test("universal pipeline creates a partial draft with field evidence and no prior conversation context", async () => {
  const db = database();
  const current = attachment(980);
  const result = await runTelegramAssistant(db, owner, "", "https://example.invalid", current, {
    updateId: 980,
    useUniversalReceiptPipeline: true,
    receiptExtractor: pipelineExtractor(pipelineReceipt()),
  });
  assert.equal(result.state, "prepared");
  assert.equal(db.rows.utility_bills.length, 1);
  assert.equal(db.rows.utility_bills[0].mandatory_due_minor, "316303");
  assert.equal(db.rows.utility_bills[0].provider_name, null);
  assert.equal(db.rows.utility_bills[0].extraction_evidence.provider.status, "missing");
  assert.ok(db.rows.utility_bills[0].review_fields.includes("provider"));
  assert.equal(db.rows.telegram_conversations[0].pending_action.payload.sourceUpdateId, 980);
  assert.equal(db.rows.telegram_conversations[0].pending_action.payload.sourceFingerprint, current.fingerprint);
  const serializedTraces = JSON.stringify(db.rows.telegram_request_traces);
  assert.equal(db.rows.telegram_request_traces.find((trace) => trace.event === "receipt.transcription")?.details.requested_model, "vision-test");
  assert.doesNotMatch(serializedTraces, /Квитанция|К оплате|Поставщик/);
  assert.doesNotMatch(serializedTraces, /rawText|sourceRegionIds|referenceAddress|accountNumber/);
});

test("universal pipeline never persists when mandatory due remains unresolved after one fallback", async () => {
  const db = database();
  const unresolved = pipelineReceipt({ mandatoryDue: pipelineField(null), printedMandatoryDue: pipelineField(null) });
  const current = attachment(981);
  const result = await runTelegramAssistant(db, owner, "", "https://example.invalid", current, {
    updateId: 981,
    useUniversalReceiptPipeline: true,
    receiptExtractor: pipelineExtractor(unresolved),
  });
  assert.equal(result.state, "unrecognized");
  assert.equal(db.rows.utility_bills.length, 0);
  assert.equal(db.rows.telegram_conversations[0].pending_action, null);
  assert.deepEqual(db.removed, [current.storagePath]);
  assert.equal(db.rows.telegram_request_traces.filter((trace) => trace.event === "receipt.fallback_transcription").length, 1);
});

test("the shared receipt deadline removes only the current file and preserves an older pending draft", async () => {
  const db = database();
  const oldPending = { type: "create_utility_bill", apartmentId: "apt-a", payload: { draftBillId: "old-draft", sourceUpdateId: 700, receiptStoragePath: "apt-a/telegram/inbox/old.pdf" } };
  db.rows.telegram_conversations.push({ telegram_user_id: owner.telegram_user_id, pending_action: structuredClone(oldPending), previous_response_id: "old-response" });
  const current = attachment(982);
  const literal = { pages: [], regions: [], keyValues: [], tables: [], totals: [], meters: [] };
  const extractor = {
    provider: "test", transcriptionModel: "vision-test", normalizationModel: "text-test",
    async transcribe() { await new Promise((resolve) => setTimeout(resolve, 5)); return { provider: "test", model: "vision-test", value: literal, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 5, failureCode: null, responseId: "late" }; },
    async transcribeFallback() { throw new Error("fallback must not run"); },
    async normalize() { throw new Error("normalization must not run"); },
  };
  const result = await runTelegramAssistant(db, owner, "", "https://example.invalid", current, { updateId: 982, useUniversalReceiptPipeline: true, receiptExtractor: extractor, receiptPipelineDeadlineMs: 1 });
  assert.equal(result.state, "unrecognized");
  assert.match(result.text, /лимит времени/u);
  assert.deepEqual(db.rows.telegram_conversations[0].pending_action, oldPending);
  assert.deepEqual(db.removed, [current.storagePath]);
  assert.equal(db.rows.utility_bills.length, 0);
});
