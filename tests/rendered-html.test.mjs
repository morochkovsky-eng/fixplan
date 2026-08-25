import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the apartment maintenance app shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Шпалерная, 34Б<\/title>/i);
  assert.match(html, /R-07 · Розетка у входа/);
  assert.match(html, /История узла/);
  assert.match(html, /Требует внимания/);
  assert.match(html, /Быстрый комментарий/);
  assert.match(html, /Доступ мастеру/);
  assert.match(html, /data-slot="card"/);
  assert.match(html, /data-slot="select-trigger"/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});
