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
const { runTelegramAssistant } = await import("../lib/server/telegram-assistant.ts");
const { replyForDocument, matchReceiptApartment, receiptGrouping, mandatoryTotalCents } = await import("../lib/server/telegram-receipt-state.ts");
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
          const item = { ...values, id: values.id ?? `bill-${rows[table].length + 1}` };
          rows[table].push(item);
          matches = [item];
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

function billCall({ service = "Электричество", address = apartments[0].address, period = "Март 2026", amount = 100, optional = 0 } = {}) {
  return {
    type: "function_call", name: "prepare_utility_bill", call_id: "call-1",
    arguments: JSON.stringify({
      service, documentAddress: address, documentKind: "electricity", period,
      amount, periodChargeAmount: amount, providerBalanceAmount: amount, creditAmount: 0,
      dueDate: "", allocation: "tenant", tenantAmount: amount,
      optionalChargeLabel: optional ? "Добровольная услуга" : "", optionalChargeAmount: optional,
      optionalChargeIncluded: Boolean(optional), note: "",
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
  assert.equal(mandatoryTotalCents(pending.payload.items), 30000);
  assert.match(utilityDraftReply(pending, "RUB", "Europe/Moscow"), /300,00/);
});

test("same month, different apartments cannot be grouped", async () => {
  const db = database();
  await run(db, 301, [billCall({ amount: 100 })]);
  await run(db, 302, [billCall({ address: apartments[1].address, service: "ЖКУ", amount: 200 })]);
  assert.equal(db.rows.utility_bills.length, 2);
  assert.notEqual(db.rows.utility_bills[0].apartment_id, db.rows.utility_bills[1].apartment_id);
  assert.equal(db.rows.telegram_conversations[0].pending_action.payload.items.length, 1);
  assert.equal(db.moved.length, 1);
  assert.equal(db.moved[0].destination.split("/")[0], "apt-b");
  assert.equal(db.rows.utility_bills[1].receipt_storage_path, db.moved[0].destination);
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

test("missing or ambiguous address asks for confirmation and does not write", async () => {
  for (const [available, address] of [[apartments, ""], [[apartments[0], { ...apartments[0], id: "copy" }], apartments[0].address]]) {
    const db = database(available);
    const result = await run(db, 601, [billCall({ address })]);
    assert.equal(result.state, "needs_apartment");
    assert.match(result.text, /уточните объект/i);
    assert.equal(db.rows.utility_bills.length, 0);
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
