import {
  DOCUMENT_KINDS, DUE_SCOPES, OPTIONAL_SCOPES, ROW_ROLES, SLOT_NAMES, TABLE_COLUMN_SEMANTICS,
} from "./types";
import type {
  CoreDiagnostic, LiteralBlock, LiteralCell, LiteralDocument, RoleClassification, RoleItem,
  RowClassification, RowRole, SlotName, TableSchema, ValidatedClassification, ValidatedRoleItem,
  ValidatedSlot,
} from "./types";
import { ReceiptContractError } from "./literal";

type RoleSlotRule = { required: SlotName[]; allowed: SlotName[] };

const STRUCTURAL_SLOTS: SlotName[] = ["label", "ignore"];
const ROLE_SLOT_RULES: Record<RowRole, RoleSlotRule> = {
  table_header: { required: [], allowed: STRUCTURAL_SLOTS },
  section_title: { required: [], allowed: STRUCTURAL_SLOTS },
  other: { required: [], allowed: STRUCTURAL_SLOTS },
  unknown: { required: [], allowed: STRUCTURAL_SLOTS },
  service_charge: { required: ["charge"], allowed: ["name", "unit", "volume", "tariff", "charge", "recalculation", "benefit", "row_total", "label", "ignore"] },
  subtotal: { required: ["row_total"], allowed: ["name", "row_total", "label", "ignore"] },
  optional_charge: { required: ["optional_charge"], allowed: ["name", "optional_charge", "label", "ignore"] },
  accrued_total: { required: ["accrued_total"], allowed: ["label", "accrued_total", "ignore"] },
  opening_balance: { required: ["opening_balance"], allowed: ["label", "opening_balance", "ignore"] },
  opening_debt: { required: ["opening_debt"], allowed: ["label", "opening_debt", "ignore"] },
  opening_advance: { required: ["opening_advance"], allowed: ["label", "opening_advance", "ignore"] },
  payment: { required: ["payment"], allowed: ["label", "payment", "ignore"] },
  benefit: { required: ["benefit"], allowed: ["label", "benefit", "ignore"] },
  recalculation: { required: ["recalculation"], allowed: ["label", "recalculation", "ignore"] },
  penalty: { required: ["penalty"], allowed: ["label", "penalty", "ignore"] },
  rounding: { required: ["rounding"], allowed: ["label", "rounding", "ignore"] },
  closing_balance: { required: ["closing_balance"], allowed: ["label", "closing_balance", "ignore"] },
  due_candidate: { required: ["due_candidate"], allowed: ["label", "due_candidate", "ignore"] },
  payment_history: { required: ["payment_history"], allowed: ["label", "payment_history", "ignore"] },
  meter_reading: { required: ["meter_curr"], allowed: ["name", "label", "meter_number", "meter_prev", "meter_curr", "consumption", "ignore"] },
  normative_reference: { required: ["normative"], allowed: ["name", "label", "normative", "ignore"] },
  provider: { required: ["provider"], allowed: ["label", "provider", "ignore"] },
  account: { required: ["account"], allowed: ["label", "account", "ignore"] },
  address: { required: ["address"], allowed: ["label", "address", "ignore"] },
  period: { required: ["period"], allowed: ["label", "period", "ignore"] },
  issue_date: { required: ["issue_date"], allowed: ["label", "issue_date", "ignore"] },
  due_date: { required: ["due_date"], allowed: ["label", "due_date", "ignore"] },
};

export const ROLE_SLOT_CONTRACT = ROLE_SLOT_RULES;

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

function parseExplicitSlots(value: unknown, path: string) {
  if (!isRecord(value)) throw new ReceiptContractError("invalid_role_schema", `${path} must be an object`);
  const slots: Record<string, { cellIds: string[]; tokenIds?: string[] }> = {};
  for (const [name, binding] of Object.entries(value)) {
    enumValue(name, SLOT_NAMES, `${path}.${name}`);
    if (!isRecord(binding)) throw new ReceiptContractError("invalid_role_schema", `${path}.${name} must be an object`);
    slots[name] = {
      cellIds: stringArray(binding.cellIds, `${path}.${name}.cellIds`),
      tokenIds: binding.tokenIds === undefined ? undefined : stringArray(binding.tokenIds, `${path}.${name}.tokenIds`),
    };
  }
  return slots;
}

function parseTableSlots(value: unknown, path: string) {
  if (!isRecord(value)) throw new ReceiptContractError("invalid_role_schema", `${path} must be an object`);
  const slots: Record<string, { columnKey: string; tokenIds?: string[] }> = {};
  for (const [name, binding] of Object.entries(value)) {
    enumValue(name, SLOT_NAMES, `${path}.${name}`);
    if (!isRecord(binding) || typeof binding.columnKey !== "string" || !binding.columnKey) {
      throw new ReceiptContractError("invalid_role_schema", `${path}.${name}.columnKey is required`);
    }
    slots[name] = {
      columnKey: binding.columnKey,
      tokenIds: binding.tokenIds === undefined ? undefined : stringArray(binding.tokenIds, `${path}.${name}.tokenIds`),
    };
  }
  return slots;
}

function parseItem(value: unknown, path: string): RoleItem {
  if (!isRecord(value)) throw new ReceiptContractError("invalid_role_schema", `${path} must be an object`);
  const role = enumValue(value.role, ROW_ROLES, `${path}.role`);
  const dueScope = value.dueScope === undefined ? undefined : enumValue(value.dueScope, DUE_SCOPES, `${path}.dueScope`);
  const optionalScope = value.optionalScope === undefined ? undefined : enumValue(value.optionalScope, OPTIONAL_SCOPES, `${path}.optionalScope`);
  const declaredState = value.declaredState === undefined ? undefined : enumValue(value.declaredState, ["not_applicable"] as const, `${path}.declaredState`);
  const affectsDue = value.affectsDue === undefined ? undefined : enumValue(value.affectsDue, ["include", "already_in_accrual", "unknown"] as const, `${path}.affectsDue`);
  if (value.mode === "label_value") {
    return { mode: "label_value", role, dueScope, optionalScope, declaredState, affectsDue, slots: parseExplicitSlots(value.slots, `${path}.slots`) };
  }
  if (value.mode === "table_columns") {
    if (typeof value.tableBlockId !== "string") throw new ReceiptContractError("invalid_role_schema", `${path}.tableBlockId is required`);
    return { mode: "table_columns", role, tableBlockId: value.tableBlockId, dueScope, optionalScope, declaredState, affectsDue, slots: parseTableSlots(value.slots, `${path}.slots`) };
  }
  throw new ReceiptContractError("invalid_enum", `${path}.mode has an unsupported value`);
}

export function parseRoleClassification(value: unknown): RoleClassification {
  if (!isRecord(value) || !Array.isArray(value.tableSchemas) || !Array.isArray(value.rows)) {
    throw new ReceiptContractError("invalid_role_schema", "documentKind, tableSchemas, and rows are required");
  }
  const documentKind = enumValue(value.documentKind, DOCUMENT_KINDS, "documentKind");
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
    if ("role" in row) throw new ReceiptContractError("invalid_role_schema", `rows[${rowIndex}].role is not part of the contract`);
    return { rowId: row.rowId, items: row.items.map((item, itemIndex) => parseItem(item, `rows[${rowIndex}].items[${itemIndex}]`)) };
  });
  return { documentKind, tableSchemas, rows };
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

function pushDiagnostic(diagnostics: CoreDiagnostic[], invalidRows: Set<string>, diagnostic: CoreDiagnostic) {
  diagnostics.push(diagnostic);
  if (diagnostic.rowId) invalidRows.add(diagnostic.rowId);
}

function validateSlotContract(item: RoleItem, rowId: string, itemIndex: number, diagnostics: CoreDiagnostic[], invalidRows: Set<string>) {
  const rule = ROLE_SLOT_RULES[item.role];
  const names = Object.keys(item.slots) as SlotName[];
  const invalidNames = names.filter((name) => !rule.allowed.includes(name));
  const missingNames = rule.required.filter((name) => !names.includes(name));
  if (invalidNames.length) pushDiagnostic(diagnostics, invalidRows, { code: "role_slot_not_allowed", severity: "error", rowId, itemIndex, sourceIds: invalidNames });
  if (missingNames.length) pushDiagnostic(diagnostics, invalidRows, { code: "role_slot_required", severity: "error", rowId, itemIndex, sourceIds: missingNames });
}

export function validateRoleClassification(document: LiteralDocument, input: unknown): ValidatedClassification {
  const classification = parseRoleClassification(input);
  const maps = documentMaps(document);
  const diagnostics: CoreDiagnostic[] = [];
  const invalidRows = new Set<string>();
  const provisionalItems: ValidatedRoleItem[] = [];
  const rowCounts = new Map<string, number>();
  const schemas = new Map<string, TableSchema>();

  for (const schema of classification.tableSchemas) {
    const block = maps.blocks.get(schema.blockId);
    if (!block || block.layout !== "table") {
      diagnostics.push({ code: "invalid_table_schema_block", severity: "error", sourceIds: [schema.blockId] });
      continue;
    }
    if (new Set(schema.columns.map((column) => column.key)).size !== schema.columns.length || schema.columns.some((column) => column.index >= block.columnCount)) {
      diagnostics.push({ code: "invalid_table_schema_column", severity: "error", sourceIds: [schema.blockId] });
      continue;
    }
    schemas.set(schema.blockId, schema);
  }

  classification.rows.forEach((rowClass) => {
    rowCounts.set(rowClass.rowId, (rowCounts.get(rowClass.rowId) ?? 0) + 1);
    const row = maps.rows.get(rowClass.rowId);
    if (!row) {
      pushDiagnostic(diagnostics, invalidRows, { code: "unknown_row_reference", severity: "error", rowId: rowClass.rowId, sourceIds: [rowClass.rowId] });
      return;
    }
    rowClass.items.forEach((item, itemIndex) => {
      validateSlotContract(item, row.id, itemIndex, diagnostics, invalidRows);
      const resolvedSlots: Partial<Record<SlotName, ValidatedSlot>> = {};
      for (const [slotName, binding] of Object.entries(item.slots) as Array<[SlotName, typeof item.slots[SlotName]]>) {
        if (!binding) continue;
        let slotCells: LiteralCell[] = [];
        let tokenIds: string[] = [];
        if (item.mode === "label_value") {
          const explicit = binding as { cellIds: string[]; tokenIds?: string[] };
          slotCells = explicit.cellIds.flatMap((id) => maps.cells.get(id) ?? []);
          if (slotCells.length !== explicit.cellIds.length || slotCells.some((cell) => !cell.id.startsWith(`${row.id}.c`))) {
            pushDiagnostic(diagnostics, invalidRows, { code: "invalid_cell_reference", severity: "error", rowId: row.id, itemIndex, sourceIds: explicit.cellIds });
            continue;
          }
          tokenIds = explicit.tokenIds ?? slotCells.flatMap((cell) => cell.numericTokens.map((token) => token.id));
        } else {
          const table = binding as { columnKey: string; tokenIds?: string[] };
          const schema = schemas.get(item.tableBlockId);
          if (!schema || !row.id.startsWith(`${item.tableBlockId}.r`)) {
            pushDiagnostic(diagnostics, invalidRows, { code: "invalid_table_item_reference", severity: "error", rowId: row.id, itemIndex, sourceIds: [item.tableBlockId] });
            continue;
          }
          const column = schema.columns.find((entry) => entry.key === table.columnKey);
          if (!column) {
            pushDiagnostic(diagnostics, invalidRows, { code: "unknown_table_column", severity: "error", rowId: row.id, itemIndex, sourceIds: [table.columnKey] });
            continue;
          }
          if (column.semantic !== slotName) {
            pushDiagnostic(diagnostics, invalidRows, { code: "table_column_semantic_mismatch", severity: "error", rowId: row.id, itemIndex, sourceIds: [table.columnKey, column.semantic, slotName] });
            continue;
          }
          const cell = cellAtLogicalColumn(row.cells, column.index);
          if (!cell) {
            pushDiagnostic(diagnostics, invalidRows, { code: "table_column_not_covered", severity: "error", rowId: row.id, itemIndex, sourceIds: [table.columnKey] });
            continue;
          }
          slotCells = [cell];
          tokenIds = table.tokenIds ?? cell.numericTokens.map((token) => token.id);
        }
        const cellIds = slotCells.map((cell) => cell.id);
        if (tokenIds.some((id) => !maps.tokens.has(id) || !cellIds.includes(maps.tokens.get(id)!.cellId))) {
          pushDiagnostic(diagnostics, invalidRows, { code: "invalid_numeric_token_reference", severity: "error", rowId: row.id, itemIndex, sourceIds: tokenIds });
          continue;
        }
        resolvedSlots[slotName] = { cellIds, tokenIds };
      }
      const sourceCellIds = [...new Set(Object.values(resolvedSlots).flatMap((slot) => slot?.cellIds ?? []))].sort();
      const sourceTokenIds = [...new Set(Object.values(resolvedSlots).flatMap((slot) => slot?.tokenIds ?? []))].sort();
      const slotIdentity = (Object.keys(resolvedSlots) as SlotName[]).sort().map((name) => `${name}=${resolvedSlots[name]!.cellIds.join("+")}`).join(";");
      provisionalItems.push({
        id: `${row.id}:${item.role}:${slotIdentity}`, rowId: row.id, mode: item.mode, role: item.role,
        tableBlockId: item.mode === "table_columns" ? item.tableBlockId : undefined,
        dueScope: item.dueScope, optionalScope: item.optionalScope, declaredState: item.declaredState,
        affectsDue: item.affectsDue, slots: resolvedSlots, sourceCellIds, sourceTokenIds,
      });
    });
  });

  for (const rowId of maps.rows.keys()) {
    const count = rowCounts.get(rowId) ?? 0;
    if (count !== 1) pushDiagnostic(diagnostics, invalidRows, { code: count === 0 ? "row_classification_missing" : "row_classification_duplicate", severity: "error", rowId, sourceIds: [rowId] });
  }

  // Invalid rows make no ownership claims. Ownership is then resolved globally so
  // classifier ordering cannot change which valid entity wins a token.
  const initiallyValid = provisionalItems.filter((item) => !invalidRows.has(item.rowId));
  const tokenOwners = new Map<string, Array<{ item: ValidatedRoleItem; slot: SlotName }>>();
  for (const item of initiallyValid) for (const [slot, value] of Object.entries(item.slots) as Array<[SlotName, ValidatedSlot]>) {
    for (const tokenId of value.tokenIds) tokenOwners.set(tokenId, [...(tokenOwners.get(tokenId) ?? []), { item, slot }]);
  }
  for (const [tokenId, owners] of [...tokenOwners.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (owners.length < 2) continue;
    for (const { item } of owners) invalidRows.add(item.rowId);
    diagnostics.push({ code: "numeric_token_already_owned", severity: "error", sourceIds: [tokenId, ...owners.map(({ item, slot }) => `${item.id}:${slot}`).sort()] });
  }

  return {
    documentKind: classification.documentKind,
    items: initiallyValid.filter((item) => !invalidRows.has(item.rowId)).sort((left, right) => left.id.localeCompare(right.id)),
    rows: classification.rows,
    diagnostics,
    invalidRowIds: [...invalidRows].sort(),
  };
}
