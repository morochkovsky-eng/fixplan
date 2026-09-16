import test from "node:test";
import assert from "node:assert/strict";
import replay from "./fixtures/receipt-august-2026-replay.json" with { type: "json" };
import { extractReceipt } from "../lib/server/receipt-extraction.ts";
import { calculateReceipt } from "../lib/receipt-calculation.ts";

test("extraction isolates documents and blocks conflicting independent exception evidence", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const inputs = [];
  process.env.OPENAI_API_KEY = "test-only";
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      inputs.push(body);
      const value = inputs.length === 1 ? replay.raw : {
        confident: true, lines: [{ label: "Пени", kind: "penalty", amount: "917.09" }],
      };
      return Response.json({ status: "completed", id: `test-${inputs.length}`,
        output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
    };
    const result = await extractReceipt({ dataUrl: "data:application/pdf;base64,dGVzdA==", filename: "test.pdf", mimeType: "application/pdf" }, "За август 2026");
    assert.equal(inputs.length, 2);
    assert.ok(inputs.every((input) => input.previous_response_id === undefined));
    assert.ok(inputs.every((input) => !JSON.stringify(input).includes("8204.65")));
    assert.match(result.raw.warnings.join(" "), /Независимое чтение/);
    assert.equal(calculateReceipt(result.raw, replay.calculation.policy).tenantMinor, null);
    assert.equal(result.verification.responseId, "test-2");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
