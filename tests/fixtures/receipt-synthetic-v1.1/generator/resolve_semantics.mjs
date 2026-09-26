// Resolves semantic spec to RoleClassification (Homory receipt-core contract) and runs core on the literal oracle.
// Usage: node resolve_semantics.mjs <core.mjs bundled from lib/server/receipt-core/index.ts>
import fs from "node:fs";
const core = await import(process.argv[2] ?? "./core.mjs");
const OUT = "out11";
const big = (_, v) => typeof v === "bigint" ? v.toString() : v;
const summary = {};
for (const f of fs.readdirSync(`${OUT}/oracle/_semspec`).sort()) {
  const spec = JSON.parse(fs.readFileSync(`${OUT}/oracle/_semspec/${f}`, "utf8"));
  const literal = JSON.parse(fs.readFileSync(`${OUT}/oracle/literal_source/${spec.caseId}.json`, "utf8"));
  const indexed = core.indexLiteralDocument(literal);
  const cells = new Map();
  for (const b of indexed.document.pages[0].blocks) for (const r of b.rows) for (const c of r.cells) cells.set(c.id, c);
  const problems = [];
  const slot = (rowId, s) => {
    const cellId = `${rowId}.c${s[1]}`; const cell = cells.get(cellId);
    if (!cell) { problems.push(`missing cell ${cellId}`); return { cellIds: [cellId] }; }
    if (s[0] === "T") {
      const binding = { cellIds: [cellId], tokenIds: [] };
      if (s[2] !== undefined) {
        const start = cell.text.indexOf(s[2]);
        if (start < 0 || start !== cell.text.lastIndexOf(s[2])) {
          problems.push(`text fragment '${s[2]}' is not unique in ${cellId}`);
        } else binding.textRange = { cellId, start, end: start + s[2].length };
      }
      return binding;
    }
    if (s[0] === "M") return { cellIds: [cellId] };
    const [raw, nth] = s[2].includes("#") ? [s[2].split("#")[0], Number(s[2].split("#")[1])] : [s[2], 1];
    const hits = cell.numericTokens.filter((t) => t.raw.replace(/\s/g, " ") === raw || t.raw.replace(/\s/g, "") === raw.replace(/\s/g, ""));
    if (!hits[nth - 1]) { problems.push(`token '${s[2]}' not in ${cellId}: [${cell.numericTokens.map((t) => t.raw).join(" | ")}]`); return { cellIds: [cellId], tokenIds: [] }; }
    return { cellIds: [cellId], tokenIds: [hits[nth - 1].id] };
  };
  const rows = spec.rows.map((r) => {
    const items = (r.key && spec.sem.rows[r.key]) ?? [{ role: r.isHeaderRow ? "table_header" : "other", slots: {} }];
    return { rowId: r.rowId, items: items.map((it) => {
      const o = { mode: "label_value", role: it.role, slots: Object.fromEntries(Object.entries(it.slots).map(([k, v]) => [k, slot(r.rowId, v)])) };
      if (it.dueScope) o.dueScope = it.dueScope; if (it.optionalScope) o.optionalScope = it.optionalScope; return o; }) };
  });
  let documents, sharedRowIds = [];
  if (spec.multiDoc) {
    const docs = [...new Set(spec.rows.map((r) => r.doc).filter(Boolean))].sort();
    documents = docs.map((d) => ({ docId: `${spec.caseId}-${d}`, documentKind: "utility", rowIds: spec.rows.filter((r) => r.doc === d).map((r) => r.rowId) }));
    sharedRowIds = spec.rows.filter((r) => !r.doc).map((r) => r.rowId);
  } else documents = [{ docId: `${spec.caseId}-D1`, documentKind: "utility", rowIds: spec.rows.map((r) => r.rowId) }];
  const classification = { documents, sharedRowIds, tableSchemas: [], rows };
  const hints = {};
  for (const r of spec.rows) if (r.key && spec.sem.hints?.[r.key]) hints[r.rowId] = spec.sem.hints[r.key];
  let observed;
  try {
    const res = core.processReceiptBundle(indexed, classification);
    observed = {
      segmentationValidity: res.segmentationValidity,
      diagnostics: res.diagnostics.map((d) => ({ code: d.code, severity: d.severity, rowId: d.rowId, sourceIds: d.sourceIds })),
      documents: res.documents.map((d) => ({
        docId: d.docId, decision: d.result.draft.decision, draftReasons: d.result.draft.reasons,
        billingPeriod: d.result.receipt.billingPeriod ?? d.result.receipt.period,
        mandatoryDue: d.result.mandatoryDue, computedDue: d.result.computedDue, computedClosingBalance: d.result.computedClosingBalance,
        reconciliations: d.result.reconciliations.map((x) => ({ equation: x.equation, status: x.status, reasons: x.reasons })),
        classificationValidity: d.classificationValidity,
      })),
    };
  } catch (e) { observed = { error: String(e.code ?? ""), message: e.message }; }
  fs.writeFileSync(`${OUT}/oracle/_observed_${spec.caseId}.json`, JSON.stringify({ classification, hints, problems, observed }, big, 1));
  summary[spec.caseId] = { problems, obs: observed.documents?.map((d) => ({ doc: d.docId, decision: d.decision, period: d.billingPeriod?.value ?? null, periodStatus: d.billingPeriod?.parseStatus,
    due: d.mandatoryDue?.amountMinor ?? d.mandatoryDue?.value ?? null, dueStatus: d.mandatoryDue?.status, reasons: d.draftReasons, eq: d.reconciliations.filter((x) => x.equation !== "E3").map((x) => `${x.equation}:${x.status}`).join(",") })) ?? observed,
    diag: observed.diagnostics?.filter((d) => d.severity === "error").map((d) => d.code) };
}
console.log(JSON.stringify(summary, big, 1));
