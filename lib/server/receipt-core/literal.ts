import { createHash } from "node:crypto";
import { BLOCK_LAYOUTS, VISUAL_CELL_STATES } from "./types";
import type { BoundingBox, CoreDiagnostic, IndexedLiteralDocument, LiteralBlock, LiteralCell, LiteralDocument, LiteralRow, VisualDocumentInput } from "./types";
import { extractNumericTokens } from "./money";

export class ReceiptContractError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ReceiptContractError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertEnum<T extends readonly string[]>(value: unknown, values: T, path: string): asserts value is T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new ReceiptContractError("invalid_enum", `${path} has an unsupported value`);
}

function parseBox(value: unknown, path: string): BoundingBox {
  if (!isRecord(value)) throw new ReceiptContractError("invalid_bbox", `${path} must be an object`);
  const box = { x: value.x, y: value.y, width: value.width, height: value.height };
  for (const [key, entry] of Object.entries(box)) {
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > 1) throw new ReceiptContractError("invalid_bbox", `${path}.${key} must be between 0 and 1`);
  }
  if (Number(box.x) + Number(box.width) > 1.000001 || Number(box.y) + Number(box.height) > 1.000001) throw new ReceiptContractError("invalid_bbox", `${path} exceeds page bounds`);
  return box as BoundingBox;
}

function positiveInteger(value: unknown, fallback: number, path: string) {
  const parsed = value ?? fallback;
  if (!Number.isInteger(parsed) || Number(parsed) < 1) throw new ReceiptContractError("invalid_span", `${path} must be a positive integer`);
  return Number(parsed);
}

export function parseVisualDocument(value: unknown): VisualDocumentInput {
  if (!isRecord(value) || !Array.isArray(value.pages)) throw new ReceiptContractError("invalid_document", "pages are required");
  assertEnum(value.documentKind, ["utility", "other", "unknown"] as const, "documentKind");
  if (typeof value.readable !== "boolean") throw new ReceiptContractError("invalid_document", "readable must be boolean");
  const pages = value.pages.map((pageValue, pageIndex) => {
    if (!isRecord(pageValue) || !Array.isArray(pageValue.blocks)) throw new ReceiptContractError("invalid_page", `pages[${pageIndex}] is invalid`);
    if (typeof pageValue.width !== "number" || pageValue.width <= 0 || typeof pageValue.height !== "number" || pageValue.height <= 0) throw new ReceiptContractError("invalid_page", `pages[${pageIndex}] dimensions are invalid`);
    const blocks = pageValue.blocks.map((blockValue, blockIndex) => {
      if (!isRecord(blockValue) || !Array.isArray(blockValue.rows)) throw new ReceiptContractError("invalid_block", `block ${blockIndex} is invalid`);
      assertEnum(blockValue.layout, BLOCK_LAYOUTS, `pages[${pageIndex}].blocks[${blockIndex}].layout`);
      const rows = blockValue.rows.map((rowValue, rowIndex) => {
        if (!isRecord(rowValue) || !Array.isArray(rowValue.cells) || rowValue.cells.length === 0) throw new ReceiptContractError("invalid_row", `row ${rowIndex} must contain cells`);
        const cells = rowValue.cells.map((cellValue, cellIndex) => {
          if (!isRecord(cellValue) || typeof cellValue.text !== "string") throw new ReceiptContractError("invalid_cell", `cell ${cellIndex} is invalid`);
          assertEnum(cellValue.state, VISUAL_CELL_STATES, `cell ${cellIndex}.state`);
          return {
            text: cellValue.text,
            state: cellValue.state,
            bbox: parseBox(cellValue.bbox, `cell ${cellIndex}.bbox`),
            colSpan: positiveInteger(cellValue.colSpan, 1, `cell ${cellIndex}.colSpan`),
            rowSpan: positiveInteger(cellValue.rowSpan, 1, `cell ${cellIndex}.rowSpan`),
            isHeader: cellValue.isHeader === true,
          };
        });
        return { cells };
      });
      return { layout: blockValue.layout, bbox: parseBox(blockValue.bbox, `block ${blockIndex}.bbox`), rows };
    });
    return { width: pageValue.width, height: pageValue.height, blocks };
  });
  return { documentKind: value.documentKind, readable: value.readable, pages };
}

function normalizeText(text: string) {
  return text.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

function indexRow(row: VisualDocumentInput["pages"][number]["blocks"][number]["rows"][number], rowId: string): LiteralRow {
  const cells: LiteralCell[] = row.cells.map((cell, cellIndex) => {
    const id = `${rowId}.c${cellIndex + 1}`;
    return { ...cell, id, state: cell.state === "ok" ? "present" : cell.state, colSpan: cell.colSpan ?? 1, rowSpan: cell.rowSpan ?? 1, numericTokens: cell.state === "ok" ? extractNumericTokens(id, cell.text) : [] };
  });
  const normalized = cells.map((cell) => `${cell.state}:${normalizeText(cell.text)}`).join("|");
  return { id: rowId, cells, normalizedTextHash: createHash("sha256").update(normalized).digest("hex") };
}

function tableGeometry(rows: LiteralRow[], diagnostics: CoreDiagnostic[]) {
  const occupied = new Map<string, string>();
  const rowWidths = rows.map(() => 0);
  rows.forEach((row, rowIndex) => {
    let column = 0;
    for (const cell of row.cells) {
      while (occupied.has(`${rowIndex}:${column}`)) column += 1;
      let invalid = rowIndex + cell.rowSpan > rows.length;
      for (let y = rowIndex; y < rowIndex + cell.rowSpan; y += 1) for (let x = column; x < column + cell.colSpan; x += 1) {
        const key = `${y}:${x}`;
        if (occupied.has(key)) invalid = true;
        else occupied.set(key, cell.id);
      }
      if (invalid && !diagnostics.some((entry) => entry.code === "invalid_span" && entry.rowId === row.id)) {
        diagnostics.push({ code: "invalid_span", severity: "review", rowId: row.id, sourceIds: [cell.id] });
      }
      column += cell.colSpan;
    }
  });
  occupied.forEach((_cellId, key) => {
    const [row, column] = key.split(":").map(Number);
    if (row < rowWidths.length) rowWidths[row] = Math.max(rowWidths[row], column + 1);
  });
  const columnCount = rowWidths.length ? Math.max(...rowWidths) : 0;
  rows.forEach((row, rowIndex) => {
    if (rowWidths[rowIndex] !== columnCount && !diagnostics.some((entry) => entry.code === "invalid_span" && entry.rowId === row.id)) {
      diagnostics.push({ code: "invalid_span", severity: "review", rowId: row.id, sourceIds: [row.id] });
    }
  });
  return columnCount;
}

export function indexLiteralDocument(input: unknown): IndexedLiteralDocument {
  const parsed = parseVisualDocument(input);
  const diagnostics: CoreDiagnostic[] = [];
  const pages = parsed.pages.map((page, pageIndex) => {
    const pageId = `p${pageIndex + 1}`;
    const blocks: LiteralBlock[] = page.blocks.map((block, blockIndex) => {
      const blockId = `${pageId}.b${blockIndex + 1}`;
      const rows = block.rows.map((row, rowIndex) => indexRow(row, `${blockId}.r${rowIndex + 1}`));
      const widths = rows.map((row) => row.cells.reduce((total, cell) => total + cell.colSpan, 0));
      const columnCount = block.layout === "table" ? tableGeometry(rows, diagnostics) : widths.length ? Math.max(...widths) : 0;
      return { id: blockId, layout: block.layout, bbox: block.bbox, rows, columnCount };
    });
    return { id: pageId, width: page.width, height: page.height, blocks };
  });
  const document: LiteralDocument = { documentKind: parsed.documentKind, readable: parsed.readable, pages };
  return { document, diagnostics };
}
