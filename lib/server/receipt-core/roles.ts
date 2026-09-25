import {
  DUE_SCOPES, OPTIONAL_SCOPES, ROW_ROLES, TABLE_COLUMN_SEMANTICS,
} from "./types";
import type {
  CoreDiagnostic, LiteralBlock, LiteralCell, LiteralDocument, RoleClassification, RoleItem,
  RowClassification, TableSchema, ValidatedClassification, ValidatedRoleItem,
} from "./types";
import { ReceiptContractError } from "./literal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new ReceiptContractError("invalid_enum", `${path} has an unsupported value`);
  return value as T[number];
}

function stringArray(value: unknown, path: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new ReceiptContractError("invalid_role_schema", `${path} must be a string array`);
  }
  return [...value] as string[];
}

function parseItem(value: unknown, path: string): RoleItem {
  if (!isRecord(value)) throw new ReceiptContractError("invalid_role_schema", `${path} must be an object`);
  const role = enumValue(value.role, ROW_ROLES, `${path}.role`);
  const numericTokenIds = value.numericTokenIds === undefined ? [] : stringArray(value.numericTokenIds, `${path}.numericTokenIds`);
  const dueScope = value.dueScope === undefined ? undefined : enumValue(value.dueScope, DUE_SCOPES, `${path}.dueScope`);
  const optionalScope = value.optionalScope === undefined ? undefined : enumValue(value.optionalScope, OPTIONAL_SCOPES, `${path}.optionalScope`);
  const declaredState = value.declaredState === undefined ? undefined : enumValue(value.declaredState, ["not_applicable"] as const, `${path}.declaredState`);
  const affectsDue = value.affectsDue === undefined ? undefined : enumValue(value.affectsDue, ["include", "already_in_accrual", "unknown"] as const, `${path}.affectsDue`);
  if (value.mode === "label_value") {
    return {
      mode: "label_value", role, numericTokenIds, dueScope, optionalScope, declaredState, affectsDue,
      labelCellIds: stringArray(value.labelCellIds, `${path}.labelCellIds`),
      valueCellIds: stringArray(value.valueCellIds, `${path}.valueCellIds`),
    };
  }
  if (value.mode === "table_columns") {
    if (typeof value.tableBlockId !== "string") throw new ReceiptContractError("invalid_role_schema", `${path}.tableBlockId is required`);
    if (value.labelColumnKey !== undefined && typeof value.labelColumnKey !== "string") throw new ReceiptContractError("invalid_role_schema", `${path}.labelColumnKey is invalid`);
    return {
      mode: "table_columns", role, numericTokenIds, dueScope, optionalScope, declaredState, affectsDue,
      tableBlockId: value.tableBlockId,
      labelColumnKey: value.labelColumnKey as string | undefined,
      valueColumnKeys: stringArray(value.valueColumnKeys, `${path}.valueColumnKeys`),
    };
  }
  throw new ReceiptContractError("invalid_enum", `${path}.mode has an unsupported value`);
}

export function parseRoleClassification(value: unknown): RoleClassification {
  if (!isRecord(value) || !Array.isArray(value.tableSchemas) || !Array.isArray(value.rows)) {
    throw new ReceiptContractError("invalid_role_schema", "tableSchemas and rows are required");
  }
  const tableSchemas: TableSchema[] = value.tableSchemas.map((schema, schemaIndex) => {
    if (!isRecord(schema) || typeof schema.blockId !== "string" || !Array.isArray(schema.columns)) {
      throw new ReceiptContractError("invalid_role_schema", `tableSchemas[${schemaIndex}] is invalid`);
    }
    return {
      blockId: schema.blockId,
      columns: schema.columns.map((column, columnIndex) => {
        if (!isRecord(column) || typeof column.key !== "string" || !column.key || !Number.isInteger(column.index) || Number(column.index) < 0) {
          throw new ReceiptContractError("invalid_role_schema", `column ${columnIndex} is invalid`);
        }
        return { key: column.key, index: Number(column.index), semantic: enumValue(column.semantic, TABLE_COLUMN_SEMANTICS, `column ${columnIndex}.semantic`) };
      }),
    };
  });
  const rows: RowClassification[] = value.rows.map((row, rowIndex) => {
    if (!isRecord(row) || typeof row.rowId !== "string" || !Array.isArray(row.items)) {
      throw new ReceiptContractError("invalid_role_schema", `rows[${rowIndex}] is invalid`);
    }
    return {
      rowId: row.rowId,
      role: enumValue(row.role, ROW_ROLES, `rows[${rowIndex}].role`),
      items: row.items.map((item, itemIndex) => parseItem(item, `rows[${rowIndex}].items[${itemIndex}]`)),
    };
  });
  return { tableSchemas, rows };
}

function documentMaps(document: LiteralDocument) {
  const blocks = new Map<string, LiteralBlock>();
  const rows = new Map<string, LiteralBlock["rows"][number]>();
  const cells = new Map<string, LiteralCell>();
  const tokens = new Map<string, LiteralCell["numericTokens"][number]>();
  for (const page of document.pages) for (const block of page.blocks) {
    blocks.set(block.id, block);
    for (const row of block.rows) {
      rows.set(row.id, row);
      for (const cell of row.cells) {
        cells.set(cell.id, cell);
        for (const token of cell.numericTokens) tokens.set(token.id, token);
      }
    }
  }
  return { blocks, rows, cells, tokens };
}

function cellAtLogicalColumn(cells: LiteralCell[], target: number) {
  let column = 0;
  for (const cell of cells) {
    if (target >= column && target < column + cell.colSpan) return cell;
    column += cell.colSpan;
  }
  return undefined;
}

export function validateRoleClassification(document: LiteralDocument, input: unknown): ValidatedClassification {
  const classification = parseRoleClassification(input);
  const maps = documentMaps(document);
  const diagnostics: CoreDiagnostic[] = [];
  const invalidRows = new Set<string>();
  const validItems: ValidatedRoleItem[] = [];
  const rowCounts = new Map<string, number>();
  const tokenOwners = new Map<string, string>();
  const schemas = new Map<string, TableSchema>();

  for (const schema of classification.tableSchemas) {
    const block = maps.blocks.get(schema.blockId);
    if (!block || block.layout !== "table") {
      diagnostics.push({ code: "invalid_table_schema_block", severity: "error", sourceIds: [schema.blockId] });
      continue;
    }
    if (new Set(schema.columns.map((column) => column.key)).size !== schema.columns.length ||
        schema.columns.some((column) => column.index >= block.columnCount)) {
      diagnostics.push({ code: "invalid_table_schema_column", severity: "error", sourceIds: [schema.blockId] });
      continue;
    }
    schemas.set(schema.blockId, schema);
  }

  classification.rows.forEach((rowClass) => {
    rowCounts.set(rowClass.rowId, (rowCounts.get(rowClass.rowId) ?? 0) + 1);
    const row = maps.rows.get(rowClass.rowId);
    if (!row) {
      diagnostics.push({ code: "unknown_row_reference", severity: "error", rowId: rowClass.rowId, sourceIds: [rowClass.rowId] });
      invalidRows.add(rowClass.rowId);
      return;
    }
    rowClass.items.forEach((item, itemIndex) => {
      let sourceCells: LiteralCell[] = [];
      if (item.mode === "label_value") {
        const ids = [...item.labelCellIds, ...item.valueCellIds];
        sourceCells = ids.flatMap((id) => maps.cells.get(id) ?? []);
        if (sourceCells.length !== ids.length || sourceCells.some((cell) => !cell.id.startsWith(`${row.id}.c`))) {
          diagnostics.push({ code: "invalid_cell_reference", severity: "error", rowId: row.id, itemIndex, sourceIds: ids });
          invalidRows.add(row.id);
          return;
        }
      } else {
        const schema = schemas.get(item.tableBlockId);
        if (!schema || !row.id.startsWith(`${item.tableBlockId}.r`)) {
          diagnostics.push({ code: "invalid_table_item_reference", severity: "error", rowId: row.id, itemIndex, sourceIds: [item.tableBlockId] });
          invalidRows.add(row.id);
          return;
        }
        const keys = [...(item.labelColumnKey ? [item.labelColumnKey] : []), ...item.valueColumnKeys];
        const columns = keys.map((key) => schema.columns.find((column) => column.key === key));
        if (columns.some((column) => !column)) {
          diagnostics.push({ code: "unknown_table_column", severity: "error", rowId: row.id, itemIndex });
          invalidRows.add(row.id);
          return;
        }
        sourceCells = [...new Set(columns.flatMap((column) => cellAtLogicalColumn(row.cells, column!.index) ?? []))];
        if (sourceCells.length === 0) {
          diagnostics.push({ code: "table_column_not_covered", severity: "error", rowId: row.id, itemIndex });
          invalidRows.add(row.id);
          return;
        }
      }

      const tokenIds = item.numericTokenIds ?? [];
      const sourceCellIds = sourceCells.map((cell) => cell.id);
      const tokensValid = tokenIds.every((id) => {
        const token = maps.tokens.get(id);
        return token && sourceCellIds.includes(token.cellId);
      });
      if (!tokensValid) {
        diagnostics.push({ code: "invalid_numeric_token_reference", severity: "error", rowId: row.id, itemIndex, sourceIds: tokenIds });
        invalidRows.add(row.id);
        return;
      }
      const duplicate = tokenIds.find((id) => tokenOwners.has(id));
      if (duplicate) {
        diagnostics.push({ code: "numeric_token_already_owned", severity: "error", rowId: row.id, itemIndex, sourceIds: [duplicate] });
        invalidRows.add(row.id);
        return;
      }
      tokenIds.forEach((id) => tokenOwners.set(id, `${row.id}:${itemIndex}`));
      validItems.push({ ...item, rowId: row.id, sourceCellIds, sourceTokenIds: tokenIds });
    });
  });

  for (const rowId of maps.rows.keys()) {
    const count = rowCounts.get(rowId) ?? 0;
    if (count !== 1) {
      diagnostics.push({ code: count === 0 ? "row_classification_missing" : "row_classification_duplicate", severity: "error", rowId, sourceIds: [rowId] });
      invalidRows.add(rowId);
    }
  }
  return { items: validItems.filter((item) => !invalidRows.has(item.rowId)), rows: classification.rows, diagnostics, invalidRowIds: [...invalidRows] };
}
