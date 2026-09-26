import type { BoundingBox, RoleClassification, VisualBlockInput, VisualCellInput, VisualDocumentInput, VisualRowInput } from "../receipt-core";
import { parseRoleClassification, parseVisualDocument, ReceiptContractError } from "../receipt-core";
import { RECEIPT_SPIKE_ADAPTER_VERSION } from "./contracts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: JsonRecord, allowed: string[], path: string) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new ReceiptContractError("reader_semantic_output_forbidden", `${path} contains forbidden keys: ${extras.join(",")}`);
}

export function parseVisionReaderOutput(value: unknown): VisualDocumentInput {
  if (!isRecord(value)) throw new ReceiptContractError("invalid_document", "reader output must be an object");
  assertOnlyKeys(value, ["readable", "pages"], "document");
  if (Array.isArray(value.pages)) value.pages.forEach((page, pageIndex) => {
    if (!isRecord(page)) return;
    assertOnlyKeys(page, ["width", "height", "blocks"], `pages[${pageIndex}]`);
    if (Array.isArray(page.blocks)) page.blocks.forEach((block, blockIndex) => {
      if (!isRecord(block)) return;
      assertOnlyKeys(block, ["layout", "bbox", "rows"], `pages[${pageIndex}].blocks[${blockIndex}]`);
      if (Array.isArray(block.rows)) block.rows.forEach((row, rowIndex) => {
        if (!isRecord(row)) return;
        assertOnlyKeys(row, ["cells"], `pages[${pageIndex}].blocks[${blockIndex}].rows[${rowIndex}]`);
        if (Array.isArray(row.cells)) row.cells.forEach((cell, cellIndex) => {
          if (!isRecord(cell)) return;
          assertOnlyKeys(cell, ["text", "state", "bbox", "colSpan", "rowSpan", "isHeader"], `cell[${cellIndex}]`);
        });
      });
    });
  });
  return parseVisualDocument(value);
}

export function parseClassifierOutput(value: unknown): RoleClassification {
  if (!isRecord(value)) throw new ReceiptContractError("invalid_role_schema", "classifier output must be an object");
  assertOnlyKeys(value, ["documents", "sharedRowIds", "tableSchemas", "rows"], "classification");
  if (Array.isArray(value.documents)) value.documents.forEach((document, index) => {
    if (isRecord(document)) assertOnlyKeys(document, ["docId", "documentKind", "rowIds"], `documents[${index}]`);
  });
  if (Array.isArray(value.tableSchemas)) value.tableSchemas.forEach((schema, index) => {
    if (isRecord(schema)) assertOnlyKeys(schema, ["blockId", "columns"], `tableSchemas[${index}]`);
  });
  if (Array.isArray(value.rows)) value.rows.forEach((row, rowIndex) => {
    if (!isRecord(row)) return;
    assertOnlyKeys(row, ["rowId", "items"], `rows[${rowIndex}]`);
    if (Array.isArray(row.items)) row.items.forEach((item, itemIndex) => {
      if (!isRecord(item)) return;
      assertOnlyKeys(item, ["mode", "role", "dueScope", "optionalScope", "declaredState", "affectsDue", "slots", "tableBlockId"], `rows[${rowIndex}].items[${itemIndex}]`);
      if (!isRecord(item.slots)) return;
      for (const [slotName, binding] of Object.entries(item.slots)) if (isRecord(binding)) {
        assertOnlyKeys(binding, item.mode === "table_columns" ? ["columnKey", "tokenIds"] : ["cellIds", "tokenIds", "textRange"], `slot ${slotName}`);
      }
    });
  });
  return parseRoleClassification(value);
}

function textFromAnchor(documentText: string, anchor: unknown) {
  if (!isRecord(anchor) || !Array.isArray(anchor.textSegments)) return "";
  return anchor.textSegments.map((segment) => {
    if (!isRecord(segment)) return "";
    const start = segment.startIndex === undefined ? 0 : Number(segment.startIndex);
    const end = Number(segment.endIndex);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > documentText.length) return "";
    return documentText.slice(start, end);
  }).join("").replace(/[\t\r ]+/gu, " ").replace(/\n+/gu, "\n").trim();
}

function googleBox(layout: unknown, pageWidth: number, pageHeight: number): BoundingBox {
  if (!isRecord(layout) || !isRecord(layout.boundingPoly)) return { x: 0, y: 0, width: 1, height: 1 };
  const poly = layout.boundingPoly;
  const normalized = Array.isArray(poly.normalizedVertices) ? poly.normalizedVertices : null;
  const vertices = normalized ?? (Array.isArray(poly.vertices) ? poly.vertices : []);
  const points = vertices.flatMap((vertex) => isRecord(vertex) ? [{
    x: Number(vertex.x ?? 0) / (normalized ? 1 : pageWidth),
    y: Number(vertex.y ?? 0) / (normalized ? 1 : pageHeight),
  }] : []);
  if (!points.length || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return { x: 0, y: 0, width: 1, height: 1 };
  const minX = Math.max(0, Math.min(...points.map((point) => point.x)));
  const minY = Math.max(0, Math.min(...points.map((point) => point.y)));
  const maxX = Math.min(1, Math.max(...points.map((point) => point.x)));
  const maxY = Math.min(1, Math.max(...points.map((point) => point.y)));
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function googleCell(value: unknown, documentText: string, pageWidth: number, pageHeight: number, isHeader: boolean): VisualCellInput | null {
  if (!isRecord(value) || !isRecord(value.layout)) return null;
  const text = textFromAnchor(documentText, value.layout.textAnchor);
  return {
    text,
    state: text ? "ok" : "blank",
    bbox: googleBox(value.layout, pageWidth, pageHeight),
    colSpan: Number.isInteger(value.colSpan) && Number(value.colSpan) > 0 ? Number(value.colSpan) : 1,
    rowSpan: Number.isInteger(value.rowSpan) && Number(value.rowSpan) > 0 ? Number(value.rowSpan) : 1,
    isHeader,
  };
}

function googleRows(values: unknown, documentText: string, width: number, height: number, isHeader: boolean) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((row): VisualRowInput[] => {
    if (!isRecord(row) || !Array.isArray(row.cells)) return [];
    const cells = row.cells.flatMap((cell) => googleCell(cell, documentText, width, height, isHeader) ?? []);
    return cells.length ? [{ cells }] : [];
  });
}

function boxCenterInside(inner: BoundingBox, outer: BoundingBox) {
  const centerX = inner.x + inner.width / 2;
  const centerY = inner.y + inner.height / 2;
  return centerX >= outer.x && centerX <= outer.x + outer.width && centerY >= outer.y && centerY <= outer.y + outer.height;
}

export function adaptGoogleDocumentAi(value: unknown): VisualDocumentInput {
  if (!isRecord(value) || typeof value.text !== "string" || !Array.isArray(value.pages)) {
    throw new ReceiptContractError("invalid_google_document_ai", "Google Document AI response requires text and pages");
  }
  const documentText = value.text;
  const pages = value.pages.map((pageValue, pageIndex) => {
    if (!isRecord(pageValue) || !isRecord(pageValue.dimension)) throw new ReceiptContractError("invalid_google_document_ai", `page ${pageIndex} has no dimensions`);
    const width = Number(pageValue.dimension.width);
    const height = Number(pageValue.dimension.height);
    if (!(width > 0 && height > 0)) throw new ReceiptContractError("invalid_google_document_ai", `page ${pageIndex} dimensions are invalid`);
    const blocks: VisualBlockInput[] = [];
    const tableBoxes: BoundingBox[] = [];
    if (Array.isArray(pageValue.tables)) for (const table of pageValue.tables) {
      if (!isRecord(table) || !isRecord(table.layout)) continue;
      const tableBox = googleBox(table.layout, width, height);
      const rows = [
        ...googleRows(table.headerRows, documentText, width, height, true),
        ...googleRows(table.bodyRows, documentText, width, height, false),
      ];
      if (rows.length) {
        tableBoxes.push(tableBox);
        blocks.push({ layout: "table", bbox: tableBox, rows });
      }
    }
    if (Array.isArray(pageValue.paragraphs)) {
      const rows = pageValue.paragraphs.flatMap((paragraph): VisualRowInput[] => {
        if (!isRecord(paragraph) || !isRecord(paragraph.layout)) return [];
        const text = textFromAnchor(documentText, paragraph.layout.textAnchor);
        if (!text) return [];
        const bbox = googleBox(paragraph.layout, width, height);
        if (tableBoxes.some((tableBox) => boxCenterInside(bbox, tableBox))) return [];
        return [{ cells: [{ text, state: "ok", bbox }] }];
      });
      if (rows.length) blocks.push({ layout: "text", bbox: { x: 0, y: 0, width: 1, height: 1 }, rows });
    }
    return { width, height, blocks };
  });
  return parseVisionReaderOutput({ readable: pages.some((page) => page.blocks.length > 0), pages });
}

type PdfTextItem = { str: string; transform: number[]; width: number; height: number };

function pdfItem(value: unknown): value is PdfTextItem {
  return isRecord(value) && typeof value.str === "string" && Array.isArray(value.transform) && value.transform.length >= 6 &&
    value.transform.every((entry) => typeof entry === "number" && Number.isFinite(entry)) &&
    typeof value.width === "number" && typeof value.height === "number";
}

function unionBox(cells: VisualCellInput[]): BoundingBox {
  const minX = Math.min(...cells.map((cell) => cell.bbox.x));
  const minY = Math.min(...cells.map((cell) => cell.bbox.y));
  const maxX = Math.max(...cells.map((cell) => cell.bbox.x + cell.bbox.width));
  const maxY = Math.max(...cells.map((cell) => cell.bbox.y + cell.bbox.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export async function adaptPdfTextLayer(data: Uint8Array): Promise<VisualDocumentInput> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const pdf = await loading.promise;
  const pages: VisualDocumentInput["pages"] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: unknown[] = content.items;
      const cells = items.filter(pdfItem).filter((item) => item.str.trim()).map((item): VisualCellInput & { centerY: number } => {
        const height = Math.max(item.height, Math.abs(item.transform[3]), 1);
        const x = Math.max(0, item.transform[4] / viewport.width);
        const y = Math.max(0, (viewport.height - item.transform[5] - height) / viewport.height);
        const width = Math.min(1 - x, Math.max(item.width / viewport.width, 0.000001));
        const normalizedHeight = Math.min(1 - y, Math.max(height / viewport.height, 0.000001));
        return { text: item.str, state: "ok", bbox: { x, y, width, height: normalizedHeight }, centerY: y + normalizedHeight / 2 };
      }).sort((left, right) => left.centerY - right.centerY || left.bbox.x - right.bbox.x);
      const rows: Array<Array<VisualCellInput & { centerY: number }>> = [];
      for (const cell of cells) {
        const row = rows.find((candidate) => Math.abs(candidate[0].centerY - cell.centerY) <= Math.max(candidate[0].bbox.height, cell.bbox.height) * 0.45);
        if (row) row.push(cell);
        else rows.push([cell]);
      }
      const visualRows = rows.map((row) => ({
        cells: row.sort((left, right) => left.bbox.x - right.bbox.x).map((cell) => ({
          text: cell.text,
          state: cell.state,
          bbox: cell.bbox,
          colSpan: cell.colSpan,
          rowSpan: cell.rowSpan,
          isHeader: cell.isHeader,
        })),
      }));
      const allCells = visualRows.flatMap((row) => row.cells);
      pages.push({ width: viewport.width, height: viewport.height, blocks: allCells.length ? [{ layout: "text", bbox: unionBox(allCells), rows: visualRows }] : [] });
      page.cleanup();
    }
  } finally {
    await loading.destroy();
  }
  return parseVisionReaderOutput({ readable: pages.some((page) => page.blocks.length > 0), pages });
}

export const adapterVersion = RECEIPT_SPIKE_ADAPTER_VERSION;
