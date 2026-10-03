import { BLOCK_LAYOUTS, VISUAL_CELL_STATES } from "../receipt-core/types";

const object = (properties: Record<string, unknown>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const normalized = { type: "number", minimum: 0, maximum: 1 } as const;
const bbox = object({ x: normalized, y: normalized, width: normalized, height: normalized });
const cell = object({
  text: { type: "string" },
  state: { type: "string", enum: [...VISUAL_CELL_STATES] },
  bbox,
  colSpan: nullable({ type: "integer", minimum: 1 }),
  rowSpan: nullable({ type: "integer", minimum: 1 }),
  isHeader: nullable({ type: "boolean" }),
});

// Optional cell attributes are required but nullable on the provider wire.
// parseVisualDocument maps null spans to 1 and null isHeader to false.
export const readerResponseSchema = object({
  readable: { type: "boolean" },
  pages: { type: "array", items: object({
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    blocks: { type: "array", items: object({
      layout: { type: "string", enum: [...BLOCK_LAYOUTS] },
      bbox,
      rows: { type: "array", items: object({ cells: { type: "array", items: cell } }) },
    }) },
  }) },
});
