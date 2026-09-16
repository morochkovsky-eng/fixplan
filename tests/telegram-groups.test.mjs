import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const modules = new Map();
async function sourceModule(path) {
  if (modules.has(path)) return modules.get(path);
  let source = ts.transpile(readFileSync(path, "utf8"), {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  });
  for (const match of [...source.matchAll(/from "(@\/[^"]+)"/g)]) {
    const child = await sourceModule(match[1].replace("@/", "") + ".ts");
    source = source.replaceAll('"' + match[1] + '"', '"' + child + '"');
  }
  const url =
    "data:text/javascript;base64," + Buffer.from(source).toString("base64");
  modules.set(path, url);
  return url;
}
const { buildTenantStatement, statementDecision } = await import(
  await sourceModule("lib/server/tenant-statement.ts")
);
const { prepareTenantStatement, handleStatementDecision } = await import(
  await sourceModule("lib/server/telegram-statements.ts")
);
const account = {
  telegram_user_id: 7,
  owner_user_id: "owner",
  owner_email: "owner@test.invalid",
  default_apartment_id: "apt",
  display_name: "Owner",
};
const bill = {
  id: "bill",
  service: "Вода",
  period: "Сентябрь 2026",
  tenant_amount: 100.25,
  reimbursement_status: "pending",
  status: "due",
  due_date_label: "25.09.2026",
};
function database() {
  const rows = {
    apartment_members: [
      {
        apartment_id: "apt",
        user_id: "owner",
        email: "owner@test.invalid",
        role: "owner",
      },
    ],
    apartments: [{ id: "apt", name: "Квартира", currency: "RUB" }],
    utility_bills: [{ ...bill, apartment_id: "apt" }],
    telegram_apartment_groups: [
      { apartment_id: "apt", chat_id: -100, title: "Аренда", version: "v1" },
    ],
    telegram_statement_deliveries: [],
    telegram_conversations: [],
  };
  return {
    rows,
    from(table) {
      let predicates = [],
        operation = "select",
        values,
        single = false;
      const q = {
        select() {
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        eq(k, v) {
          predicates.push(
            (r) =>
              String(
                k.includes("->>")
                  ? r[k.split("->>")[0]]?.[k.split("->>")[1]]
                  : r[k],
              ) === String(v),
          );
          return q;
        },
        in(k, v) {
          predicates.push((r) => v.includes(r[k]));
          return q;
        },
        ilike(k, v) {
          return q.eq(k, v);
        },
        update(v) {
          operation = "update";
          values = v;
          return q;
        },
        insert(v) {
          operation = "insert";
          values = v;
          return q;
        },
        upsert(v) {
          operation = "upsert";
          values = v;
          return q;
        },
        single() {
          single = true;
          return q;
        },
        maybeSingle() {
          single = true;
          return q;
        },
        then(resolve) {
          let matches = rows[table].filter((r) =>
            predicates.every((p) => p(r)),
          );
          if (operation === "insert") {
            const r = {
              id: "delivery-" + rows[table].length,
              status: "prepared",
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              ...values,
            };
            rows[table].push(r);
            matches = [r];
          }
          if (operation === "upsert") {
            let r = rows[table].find(
              (r) => r.telegram_user_id === values.telegram_user_id,
            );
            if (!r) {
              r = {};
              rows[table].push(r);
            }
            Object.assign(r, values);
            matches = [r];
          }
          if (operation === "update") {
            if (
              values.status === "sending" &&
              matches.some((m) =>
                rows[table].some(
                  (r) =>
                    r.id !== m.id &&
                    r.group_version === m.group_version &&
                    r.fingerprint === m.fingerprint &&
                    ["sent", "sending", "unknown"].includes(r.status),
                ),
              )
            )
              return resolve({ data: null, error: { code: "23505" } });
            matches.forEach((r) => Object.assign(r, values));
          }
          return resolve({
            data: single ? (matches[0] ?? null) : matches,
            error: null,
          });
        },
      };
      return q;
    },
  };
}
async function preview(db) {
  return prepareTenantStatement(db, account, "apt", "2026-09");
}
test("tenant statement contains only unpaid tenant share, precise sum, no owner notes", () => {
  const result = buildTenantStatement("Квартира", "Сентябрь 2026", "RUB", [
    bill,
    { ...bill, id: "2", tenant_amount: 0.1 },
    { ...bill, id: "3", tenant_amount: 0.2 },
    { ...bill, id: "owner", tenant_amount: 0 },
    { ...bill, id: "paid", reimbursement_status: "received" },
    { ...bill, id: "draft", status: "draft" },
  ]);
  assert.match(result.body, /100,55/);
  assert.equal(result.body.split("Вода:").length - 1, 3);
  assert.equal(
    buildTenantStatement("A", "P", "RUB", [{ ...bill, tenant_amount: 0 }]),
    null,
  );
});
test("only explicit short confirmation sends; unrelated phrases do not", () => {
  for (const text of [
    "да",
    "Да, отправляем!",
    "отправь в группу",
    "отправь счёт в группу",
  ])
    assert.equal(statementDecision(text), "send");
  for (const text of [
    "да, но измени сумму",
    "не отправляй пока",
    "давай завтра",
    "да и добавь долг",
  ])
    assert.equal(statementDecision(text), null);
  assert.equal(statementDecision("не отправляй"), "cancel");
});
test("preview does not send and snapshots apartment, group, body", async () => {
  const db = database();
  const result = await preview(db);
  assert.ok(result.deliveryId);
  assert.equal(db.rows.telegram_statement_deliveries[0].chat_id, -100);
  assert.equal(
    db.rows.telegram_conversations[0].pending_action.type,
    "send_utility_statement",
  );
});
test("unconfirmed bill blocks preview", async () => {
  const db = database();
  db.rows.utility_bills[0].status = "draft";
  assert.equal((await preview(db)).deliveryId, undefined);
});
test("no group still produces copyable statement", async () => {
  const db = database();
  db.rows.telegram_apartment_groups = [];
  await preview(db);
  assert.equal(db.rows.telegram_statement_deliveries[0].chat_id, null);
});
test("new preview revokes old approval", async () => {
  const db = database();
  const first = await preview(db);
  await preview(db);
  assert.equal(db.rows.telegram_statement_deliveries[0].status, "cancelled");
  assert.match(
    await handleStatementDecision(db, account, first.deliveryId, "send"),
    /устарело/,
  );
});
test("cancel and copy never send", async () => {
  const db = database();
  const p = await preview(db);
  assert.match(
    await handleStatementDecision(db, account, p.deliveryId, "copy"),
    /Коммунальные платежи/,
  );
  assert.match(
    await handleStatementDecision(db, account, p.deliveryId, "cancel"),
    /личном чате/,
  );
});
test("other account cannot approve or copy a statement", async () => {
  const db = database();
  const p = await preview(db);
  assert.match(
    await handleStatementDecision(
      db,
      { ...account, telegram_user_id: 9 },
      p.deliveryId,
      "send",
    ),
    /недоступен/,
  );
});
test("lost apartment membership blocks sending", async () => {
  const db = database();
  const p = await preview(db);
  db.rows.apartment_members = [];
  assert.match(
    await handleStatementDecision(db, account, p.deliveryId, "send"),
    /Нет доступа/,
  );
});
test("changed recipient or bill requires new preview", async () => {
  for (const mutation of [
    (db) => (db.rows.telegram_apartment_groups[0].version = "v2"),
    (db) => (db.rows.utility_bills[0].tenant_amount = 101),
  ]) {
    const db = database();
    const p = await preview(db);
    mutation(db);
    assert.match(
      await handleStatementDecision(db, account, p.deliveryId, "send"),
      /заново|Заново/,
    );
  }
});
test("concurrent approvals send once and repeated statement is blocked", async () => {
  const db = database();
  const p = await preview(db);
  let sends = 0;
  const original = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test";
  globalThis.fetch = async (_url, options) => {
    sends++;
    const body = JSON.parse(options.body);
    assert.equal(body.chat_id, -100);
    assert.match(body.text, /100,25/);
    return Response.json({ ok: true, result: { message_id: 5 } });
  };
  try {
    await Promise.all([
      handleStatementDecision(db, account, p.deliveryId, "send"),
      handleStatementDecision(db, account, p.deliveryId, "send"),
    ]);
    assert.equal(sends, 1);
    assert.equal(db.rows.telegram_statement_deliveries[0].status, "sent");
    const again = await preview(db);
    assert.match(
      await handleStatementDecision(db, account, again.deliveryId, "send"),
      /уже отправлен/,
    );
    assert.equal(sends, 1);
  } finally {
    globalThis.fetch = original;
    delete process.env.TELEGRAM_BOT_TOKEN;
  }
});
test("network uncertainty is recorded and cannot auto-resend", async () => {
  const db = database();
  const p = await preview(db);
  const original = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test";
  let sends = 0;
  globalThis.fetch = async () => {
    sends++;
    throw new Error("timeout");
  };
  try {
    assert.match(
      await handleStatementDecision(db, account, p.deliveryId, "send"),
      /могло дойти/,
    );
    assert.equal(db.rows.telegram_statement_deliveries[0].status, "unknown");
    await handleStatementDecision(db, account, p.deliveryId, "send");
    assert.equal(sends, 1);
  } finally {
    globalThis.fetch = original;
    delete process.env.TELEGRAM_BOT_TOKEN;
  }
});
