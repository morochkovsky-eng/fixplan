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
    source = source.replaceAll(`"${match[1]}"`, `"${child}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  modules.set(path, url);
  return url;
}

const processing = await import(
  await sourceModule("lib/server/telegram-processing.ts")
);

function database(initial = []) {
  const rows = {
    telegram_updates: initial.map((row) => ({ ...row })),
    telegram_request_traces: [],
  };
  return {
    rows,
    from(table) {
      let operation = "select";
      let values;
      const predicates = [];
      const query = {
        select() {
          return query;
        },
        insert(next) {
          operation = "insert";
          values = next;
          return query;
        },
        update(next) {
          operation = "update";
          values = next;
          return query;
        },
        eq(key, value) {
          predicates.push((row) => String(row[key]) === String(value));
          return query;
        },
        is(key, value) {
          predicates.push((row) => row[key] === value);
          return query;
        },
        maybeSingle() {
          return execute(true);
        },
        then(resolve) {
          return execute(false).then(resolve);
        },
      };
      async function execute(single) {
        let matches = rows[table].filter((row) =>
          predicates.every((predicate) => predicate(row)),
        );
        if (operation === "insert") {
          rows[table].push({ ...values });
          matches = [{ ...values }];
        }
        if (operation === "update") {
          matches.forEach((row) => Object.assign(row, values));
        }
        return { data: single ? (matches[0] ?? null) : matches, error: null };
      }
      return query;
    },
  };
}

function telegramFetch(events, failDelete = 0) {
  return async (url, init) => {
    const method = String(url).split("/").at(-1);
    const body = JSON.parse(String(init?.body ?? "{}"));
    events.push({ method, body });
    if (method === "deleteMessage" && failDelete-- > 0) {
      return Response.json({ ok: false, error_code: 500 }, { status: 500 });
    }
    return Response.json({
      ok: true,
      result: method === "deleteMessage" ? true : { message_id: 700 },
    });
  };
}

function restoreToken(value) {
  if (value === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = value;
}

test("ordinary request uses the NOMI emoji, edits one status, then removes it after delivery", async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const events = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  globalThis.fetch = telegramFetch(events);
  const admin = database([
    {
      update_id: 1,
      telegram_user_id: 11,
      chat_id: 101,
      processing_message_id: null,
    },
  ]);
  try {
    const messageId = await processing.createQueuedProcessingStatus(
      admin,
      1,
      101,
    );
    assert.equal(messageId, 700);
    assert.equal(events[0].body.text, "🫥 Запрос в очереди…");
    assert.equal(events[0].body.entities[0].custom_emoji_id, "5269577632676092329");
    await processing.markTelegramProcessingRunning(admin, {
      ...admin.rows.telegram_updates[0],
      payload: { update_id: 1 },
      status_last_updated_at: null,
    });
    assert.equal(events[1].method, "editMessageText");
    assert.equal(events[1].body.message_id, 700);
    assert.equal(events[1].body.text, "🫥 Обрабатываю…");
    await processing.cleanupTelegramProcessingStatus(
      admin,
      admin.rows.telegram_updates[0],
      true,
    );
    assert.equal(events.at(-1).method, "deleteMessage");
  } finally {
    globalThis.fetch = oldFetch;
    restoreToken(oldToken);
  }
});

test("three queued messages are constrained to FIFO execution per Telegram user", () => {
  const migration = readFileSync(
    "supabase/migrations/20260918120000_add_telegram_processing_queue.sql",
    "utf8",
  );
  assert.match(migration, /first_for_user\.telegram_user_id = queued\.telegram_user_id/);
  assert.match(migration, /order by first_for_user\.received_at, first_for_user\.update_id/);
  assert.match(migration, /active\.status = 'running'/);
  assert.match(migration, /for update of queued skip locked/);
});

test("an AI error may clean its status only after the error reply was delivered", async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const events = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  globalThis.fetch = telegramFetch(events);
  const admin = database([{ update_id: 2, telegram_user_id: 12, chat_id: 102, processing_message_id: 702 }]);
  try {
    assert.equal(await processing.cleanupTelegramProcessingStatus(admin, admin.rows.telegram_updates[0], true), true);
    assert.equal(events.length, 1);
  } finally {
    globalThis.fetch = oldFetch;
    restoreToken(oldToken);
  }
});

test("failed final delivery never removes the processing status prematurely", async () => {
  const oldFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = telegramFetch(events);
  const admin = database([{ update_id: 3, telegram_user_id: 13, chat_id: 103, processing_message_id: 703 }]);
  try {
    assert.equal(await processing.cleanupTelegramProcessingStatus(admin, admin.rows.telegram_updates[0], false), false);
    assert.deepEqual(events, []);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("status deletion is best effort and retries no more than twice", async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const events = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  globalThis.fetch = telegramFetch(events, 2);
  const admin = database([{ update_id: 4, telegram_user_id: 14, chat_id: 104, processing_message_id: 704 }]);
  try {
    assert.equal(await processing.cleanupTelegramProcessingStatus(admin, admin.rows.telegram_updates[0], true), false);
    assert.equal(events.filter((event) => event.method === "deleteMessage").length, 2);
    assert.equal(admin.rows.telegram_updates[0].cleanup_attempts, 2);
  } finally {
    globalThis.fetch = oldFetch;
    restoreToken(oldToken);
  }
});

test("duplicate webhook and worker delivery are guarded by stable update ids", () => {
  const webhook = readFileSync("app/api/telegram/webhook/route.ts", "utf8");
  assert.match(webhook, /update_id: update\.update_id/);
  assert.match(webhook, /queueError\.code === "23505"/);
  assert.match(webhook, /duplicate: true/);
  assert.match(webhook, /String\(update\.update_id\) !== internalJobId/);
  assert.match(webhook, /\.eq\("delivery_state", "pending"\)/);
  assert.match(webhook, /delivery_state: "sending"/);
  assert.match(webhook, /delivery_state: deliveredMessageId \? "delivered"/);
});

test("a worker restart requeues only stale jobs without a confirmed response", () => {
  const migration = readFileSync(
    "supabase/migrations/20260918120000_add_telegram_processing_queue.sql",
    "utf8",
  );
  assert.match(migration, /lock_expires_at <= now\(\)/);
  assert.match(migration, /response_message_id is null/);
  assert.match(migration, /set status = 'queued'/);
  assert.match(migration, /delivery_state = 'sending'/);
  assert.match(migration, /set status = 'delivery_unknown'/);
  assert.match(migration, /resolve_telegram_delivery_unknown/);
  assert.match(migration, /p_resolution = 'retry'/);
  assert.match(migration, /p_resolution = 'mark_delivered'/);
  assert.match(migration, /p_resolution = 'fail'/);
  const worker = readFileSync("app/api/telegram/worker/route.ts", "utf8");
  assert.match(worker, /pendingCleanup/);
  assert.match(worker, /cleanup_attempts", 2/);
  assert.match(worker, /cleanupTelegramProcessingStatus/);
  assert.match(worker, /current\.delivery_state === "sending"/);
  assert.match(worker, /markTelegramDeliveryUncertain/);
});

test("voice, photo, document and long callback actions enter the durable queue", () => {
  assert.equal(processing.shouldQueueTelegramUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 1, type: "private" }, voice: { file_id: "v", duration: 1 } } }), true);
  assert.equal(processing.shouldQueueTelegramUpdate({ update_id: 2, message: { message_id: 2, chat: { id: 1, type: "private" }, photo: [{ file_id: "p", width: 1, height: 1 }] } }), true);
  assert.equal(processing.shouldQueueTelegramUpdate({ update_id: 3, message: { message_id: 3, chat: { id: 1, type: "private" }, document: { file_id: "d" } } }), true);
  assert.equal(processing.shouldQueueTelegramUpdate({ update_id: 4, callback_query: { id: "c", from: { id: 1, first_name: "A" }, data: "fixplan:pending:confirm" } }), true);
  assert.equal(processing.shouldQueueTelegramUpdate({ update_id: 5, message: { message_id: 5, chat: { id: 1, type: "private" }, text: "/start" } }), false);
});

test("status ownership is bound to update, user, chat and processing message", () => {
  const source = readFileSync("lib/server/telegram-processing.ts", "utf8");
  for (const field of ["update_id", "telegram_user_id", "chat_id", "processing_message_id"]) {
    assert.match(source, new RegExp(`\\.eq\\("${field}"`));
  }
});

test("status traces and errors never record Telegram tokens or user message text", () => {
  const helper = readFileSync("lib/server/telegram-processing.ts", "utf8");
  const webhook = readFileSync("app/api/telegram/webhook/route.ts", "utf8");
  assert.doesNotMatch(helper, /TELEGRAM_BOT_TOKEN/);
  assert.doesNotMatch(helper, /payload:\s*job\.payload/);
  assert.doesNotMatch(webhook, /console\.(?:log|error)\([^\n]*(?:message\.text|caption|TELEGRAM_BOT_TOKEN)/);
  assert.match(webhook, /code: sendError instanceof Error \? sendError\.name/);
});
