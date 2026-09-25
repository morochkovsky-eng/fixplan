export const BLOCK_LAYOUTS = ["table", "kv", "text", "code"] as const;
export const VISUAL_CELL_STATES = ["ok", "blank", "illegible"] as const;
export const FIELD_STATES = ["printed", "printed_blank", "absent", "illegible", "not_applicable"] as const;
export const ROW_ROLES = [
  "table_header", "section_title", "other", "unknown",
  "service_charge", "subtotal", "optional_charge",
  "accrued_total", "opening_balance", "opening_debt", "opening_advance",
  "payment", "benefit", "recalculation", "penalty", "rounding",
  "due_candidate", "payment_history", "meter_reading", "normative_reference",
  "provider", "account", "address", "period", "issue_date", "due_date",
] as const;
export const TABLE_COLUMN_SEMANTICS = [
  "label", "value", "unit", "volume", "tariff", "amount", "previous", "current", "other",
] as const;
export const DUE_SCOPES = ["period_only", "with_balance", "unknown"] as const;
export const OPTIONAL_SCOPES = ["excluded", "included", "unknown"] as const;
export const RECONCILIATION_STATUSES = ["closed", "open", "insufficient", "ambiguous"] as const;

export type BlockLayout = typeof BLOCK_LAYOUTS[number];
export type VisualCellState = typeof VISUAL_CELL_STATES[number];
export type LiteralCellState = "present" | "blank" | "illegible";
export type FieldState = typeof FIELD_STATES[number];
export type RowRole = typeof ROW_ROLES[number];
export type TableColumnSemantic = typeof TABLE_COLUMN_SEMANTICS[number];
export type DueScope = typeof DUE_SCOPES[number];
export type OptionalScope = typeof OPTIONAL_SCOPES[number];
export type ReconciliationStatus = typeof RECONCILIATION_STATUSES[number];

export type BoundingBox = { x: number; y: number; width: number; height: number };

export type VisualCellInput = {
  text: string;
  state: VisualCellState;
  bbox: BoundingBox;
  colSpan?: number;
  rowSpan?: number;
  isHeader?: boolean;
};

export type VisualRowInput = { cells: VisualCellInput[] };
export type VisualBlockInput = { layout: BlockLayout; bbox: BoundingBox; rows: VisualRowInput[] };
export type VisualPageInput = { width: number; height: number; blocks: VisualBlockInput[] };
export type VisualDocumentInput = { documentKind: "utility" | "other" | "unknown"; readable: boolean; pages: VisualPageInput[] };

export type NumericToken = {
  id: string;
  cellId: string;
  raw: string;
  coefficient: bigint;
  scale: number;
};

export type LiteralCell = Omit<VisualCellInput, "state" | "colSpan" | "rowSpan"> & {
  id: string;
  state: LiteralCellState;
  colSpan: number;
  rowSpan: number;
  numericTokens: NumericToken[];
};
export type LiteralRow = { id: string; cells: LiteralCell[]; normalizedTextHash: string };
export type LiteralBlock = { id: string; layout: BlockLayout; bbox: BoundingBox; rows: LiteralRow[]; columnCount: number };
export type LiteralPage = { id: string; width: number; height: number; blocks: LiteralBlock[] };
export type LiteralDocument = { documentKind: VisualDocumentInput["documentKind"]; readable: boolean; pages: LiteralPage[] };

export type CoreDiagnostic = {
  code: string;
  severity: "error" | "review" | "warning";
  rowId?: string;
  itemIndex?: number;
  sourceIds?: string[];
  deltaMinor?: bigint;
};

export type IndexedLiteralDocument = { document: LiteralDocument; diagnostics: CoreDiagnostic[] };

export type TableColumn = { key: string; index: number; semantic: TableColumnSemantic };
export type TableSchema = { blockId: string; columns: TableColumn[] };

type RoleItemBase = {
  role: RowRole;
  numericTokenIds?: string[];
  dueScope?: DueScope;
  optionalScope?: OptionalScope;
  declaredState?: "not_applicable";
  affectsDue?: "include" | "already_in_accrual" | "unknown";
};
export type LabelValueRoleItem = RoleItemBase & {
  mode: "label_value";
  labelCellIds: string[];
  valueCellIds: string[];
};
export type TableColumnsRoleItem = RoleItemBase & {
  mode: "table_columns";
  tableBlockId: string;
  labelColumnKey?: string;
  valueColumnKeys: string[];
};
export type RoleItem = LabelValueRoleItem | TableColumnsRoleItem;
export type RowClassification = { rowId: string; role: RowRole; items: RoleItem[] };
export type RoleClassification = { tableSchemas: TableSchema[]; rows: RowClassification[] };

export type ValidatedRoleItem = RoleItem & {
  rowId: string;
  sourceCellIds: string[];
  sourceTokenIds: string[];
};
export type ValidatedClassification = {
  items: ValidatedRoleItem[];
  rows: RowClassification[];
  diagnostics: CoreDiagnostic[];
  invalidRowIds: string[];
};

export type NormalizedField<T> = {
  state: FieldState;
  value: T | null;
  sourceCellIds: string[];
  sourceTokenIds: string[];
};

export type FinancialComponentRole = Extract<RowRole,
  "accrued_total" | "opening_balance" | "opening_debt" | "opening_advance" |
  "payment" | "benefit" | "recalculation" | "penalty" | "rounding" | "payment_history"
>;

export type FinancialComponent = {
  role: FinancialComponentRole;
  amountMinor: bigint;
  printedAmountMinor: bigint;
  affectsDue: "include" | "already_in_accrual" | "unknown";
  sourceTokenIds: string[];
};

export type DueCandidate = {
  amountMinor: bigint;
  scope: DueScope;
  optional: OptionalScope;
  sourceTokenIds: string[];
};

export type ChargeLine = {
  role: "service_charge" | "optional_charge" | "subtotal";
  amountMinor: bigint | null;
  volume: NumericToken | null;
  tariff: NumericToken | null;
  sourceTokenIds: string[];
  needsReview: boolean;
};

export type MeterEntry = {
  reading: NumericToken | null;
  state: FieldState;
  sourceCellIds: string[];
  sourceTokenIds: string[];
};

export type CanonicalReceipt = {
  documentKind: LiteralDocument["documentKind"];
  readable: boolean;
  period: NormalizedField<string>;
  accruedTotal: NormalizedField<bigint>;
  dueDate: NormalizedField<string>;
  financialComponents: FinancialComponent[];
  dueCandidates: DueCandidate[];
  serviceLines: ChargeLine[];
  optionalCharges: ChargeLine[];
  meters: MeterEntry[];
  unknownRowIds: string[];
  diagnostics: CoreDiagnostic[];
};

export type Reconciliation = {
  equation: "E1" | "E2" | "E3";
  status: ReconciliationStatus;
  reasons: string[];
  sourceIds: string[];
  expectedMinor?: bigint;
  actualMinor?: bigint;
  deltaMinor?: bigint;
};

export type MandatoryDueDecision = {
  status: "confirmed" | "needs_review" | "absent";
  valueMinor: bigint | null;
  source: "printed" | "computed_excluding_optional" | null;
  reasons: string[];
};

export type DraftDecision = {
  decision: "reject" | "partial_draft" | "confirmed_draft";
  needsReview: boolean;
  includeInMonthlyTotal: boolean;
  reasons: string[];
};

export type ReceiptCoreResult = {
  receipt: CanonicalReceipt;
  computedDue: bigint | null;
  machineDue: null;
  reconciliations: Reconciliation[];
  mandatoryDue: MandatoryDueDecision;
  draft: DraftDecision;
};
