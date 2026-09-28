import { DOCUMENT_KINDS, DUE_SCOPES, OPTIONAL_SCOPES, ROW_ROLES, SLOT_NAMES, TABLE_COLUMN_SEMANTICS } from "../receipt-core/types";

const str = { type: "string" } as const;
const strings = { type: "array", items: str } as const;
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const textRange = object({ cellId: str, start: { type: "integer" }, end: { type: "integer" } });
const commonItem = {
  role: { type: "string", enum: [...ROW_ROLES] },
  dueScope: nullable({ type: "string", enum: [...DUE_SCOPES] }),
  optionalScope: nullable({ type: "string", enum: [...OPTIONAL_SCOPES] }),
  declaredState: nullable({ type: "string", enum: ["not_applicable"] }),
  affectsDue: nullable({ type: "string", enum: ["include", "already_in_accrual", "unknown"] }),
};
const explicitSlot = object({ slot: { type: "string", enum: [...SLOT_NAMES] }, cellIds: strings, tokenIds: strings, textRange: nullable(textRange) });
const tableSlot = object({ slot: { type: "string", enum: [...SLOT_NAMES] }, columnKey: str, tokenIds: strings });

// The wire schema uses an array for slots: strict Structured Outputs cannot
// represent a sparse map without admitting arbitrary keys. The adapter below
// converts this wire format back to the unchanged core contract.
export const classifierResponseSchema = object({
  documents: { type: "array", items: object({ docId: str, documentKind: { type: "string", enum: [...DOCUMENT_KINDS] }, rowIds: strings }) },
  sharedRowIds: strings,
  tableSchemas: { type: "array", items: object({ blockId: str, columns: { type: "array", items: object({ key: str, index: { type: "integer" }, semantic: { type: "string", enum: [...TABLE_COLUMN_SEMANTICS] } }) } }) },
  rows: { type: "array", items: object({ rowId: str, items: { type: "array", items: { anyOf: [
    object({ mode: { type: "string", enum: ["label_value"] }, ...commonItem, slots: { type: "array", items: explicitSlot } }),
    object({ mode: { type: "string", enum: ["table_columns"] }, ...commonItem, tableBlockId: str, slots: { type: "array", items: tableSlot } }),
  ] } } }) },
});

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function classifierWireToCore(value: unknown): unknown {
  if (!record(value) || !Array.isArray(value.rows)) return value;
  return { ...value, rows: value.rows.map((row: unknown) => {
    if (!record(row) || !Array.isArray(row.items)) return row;
    return { ...row, items: row.items.map((item: unknown) => {
      if (!record(item) || !Array.isArray(item.slots)) return item;
      const slots: Record<string, unknown> = Object.create(null);
      for (const binding of item.slots) {
        if (!record(binding) || typeof binding.slot !== "string" || Object.hasOwn(slots, binding.slot)) throw new Error("classifier_slot_wire_invalid");
        const { slot, ...source } = binding;
        void slot;
        slots[binding.slot] = Object.fromEntries(Object.entries(source).filter(([, entry]) => entry !== null));
      }
      const normalized: Record<string, unknown> = { ...item, slots };
      for (const field of ["dueScope", "optionalScope", "declaredState", "affectsDue"] as const) {
        if (normalized[field] === null) delete normalized[field];
      }
      return normalized;
    }) };
  }) };
}
