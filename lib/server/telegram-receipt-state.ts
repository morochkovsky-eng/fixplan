import { normalizeUtilityPeriod } from "@/lib/utility-period";
import { moneyToMinor } from "@/lib/server/receipt-money";

export type ReceiptDocument = {
  updateId: number;
  storagePath: string;
  fingerprint: string;
};

export type DocumentReply = {
  text: string;
  document: ReceiptDocument;
  state: "prepared" | "unrecognized" | "needs_apartment" | "duplicate" | "possible_correction" | "other";
  apartmentId?: string;
};

export const unreadableReceiptReply = "Не удалось уверенно распознать эту квитанцию. Проверьте качество файла и отправьте его ещё раз. Если был прежний черновик, его подтверждение закрыто.";
export const unassignedReceiptReply = "Не удалось однозначно определить объект по адресу в этой квитанции. Уточните объект и отправьте файл ещё раз; черновик не создан.";
export const duplicateReceiptReply = "Эта квитанция уже есть в выбранном объекте за этот месяц. Повторно её не добавлял.";
export const possibleCorrectionReply = "Для этого поставщика и месяца уже есть квитанция с другим содержимым. Автоматическая замена пока не поддерживается: файл не включён в черновик. Проверьте прежний черновик и отправьте исправленную квитанцию повторно после выбора действия; ответ «да» ничего не заменит.";

export function documentReply(
  document: ReceiptDocument,
  state: DocumentReply["state"],
  text = "",
  apartmentId?: string,
): DocumentReply {
  const fallbacks = {
    prepared: unreadableReceiptReply,
    unrecognized: unreadableReceiptReply,
    needs_apartment: unassignedReceiptReply,
    duplicate: duplicateReceiptReply,
    possible_correction: possibleCorrectionReply,
    other: unreadableReceiptReply,
  };
  return { document, state, text: text || fallbacks[state], apartmentId };
}

export function isCurrentReceiptDraft(pending: Record<string, unknown> | null, document: ReceiptDocument) {
  if (pending?.type !== "create_utility_bill" && pending?.type !== "collect_utility_bill") return false;
  const payload = pending.payload;
  if (!payload || typeof payload !== "object") return false;
  const bill = payload as Record<string, unknown>;
  return bill.sourceUpdateId === document.updateId &&
    bill.receiptStoragePath === document.storagePath &&
    bill.sourceFingerprint === document.fingerprint;
}

function isCurrentOtherDraft(pending: Record<string, unknown> | null, document: ReceiptDocument) {
  if (!pending || pending.type === "create_utility_bill") return false;
  const payload = pending.payload;
  if (!payload || typeof payload !== "object") return false;
  const item = payload as Record<string, unknown>;
  return item.sourceUpdateId === document.updateId &&
    item.photoStoragePath === document.storagePath &&
    item.sourceFingerprint === document.fingerprint;
}

export function replyForDocument(
  result: string | DocumentReply,
  pending: Record<string, unknown> | null,
) {
  if (typeof result === "string") return { text: result, pending };
  if (result.state === "other") {
    return { text: result.text, pending: isCurrentOtherDraft(pending, result.document) ? pending : null };
  }
  if (result.state !== "prepared") return { text: result.text, pending: null };
  if (!isCurrentReceiptDraft(pending, result.document)) {
    return { text: unreadableReceiptReply, pending: null };
  }
  return { text: result.text, pending };
}

export function isExplicitDraftRequest(message: string) {
  const normalized = message.toLocaleLowerCase("ru-RU");
  return /(?:покажи|открой|продолжи|измени|исправь|дополни|отредактируй).{0,100}черновик/u.test(normalized) ||
    /черновик.{0,100}(?:покажи|открой|продолжи|измени|исправь|дополни|отредактируй)/u.test(normalized);
}

export function replyForUpdate(
  result: string | DocumentReply,
  pending: Record<string, unknown> | null,
  previousPending: Record<string, unknown> | null,
  explicitDraftRequest = false,
) {
  if (typeof result !== "string") return replyForDocument(result, pending);
  const changed = JSON.stringify(pending) !== JSON.stringify(previousPending);
  return { text: result, pending: pending && (changed || explicitDraftRequest) ? pending : null };
}

function normalizedAddress(value: string) {
  return value.toLocaleLowerCase("ru-RU")
    .replace(/(^|\s)(?:город|г\.?|улица|ул\.?|дом|д\.?|квартира|кв\.?)(?=\s|[,;])/gu, "$1")
    .replace(/[.,;:/\\№#-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function matchReceiptApartment<T extends { id: string; address: string }>(
  documentAddress: string,
  apartments: T[],
): { kind: "matched"; apartment: T } | { kind: "missing" | "ambiguous" } {
  const key = normalizedAddress(documentAddress);
  if (!key || key.length < 8) return { kind: "missing" };
  const matches = apartments.filter((apartment) => normalizedAddress(apartment.address) === key);
  if (matches.length === 1) return { kind: "matched", apartment: matches[0] };
  return { kind: matches.length ? "ambiguous" : "missing" };
}

type ReceiptItem = {
  apartmentId?: string;
  period?: string;
  service?: string;
  sourceFingerprint?: string;
  receipt_storage_path?: string | null;
  receiptStoragePath?: string | null;
  amount?: number | string;
  tenant_amount?: number | string;
  tenantAmount?: number | string;
  periodChargeAmount?: number | string;
  mandatoryDueAmount?: number | string;
  mandatory_due_minor?: number | string;
  optional_charge_amount?: number | string;
  optional_charge_included?: boolean;
  optionalChargeAmount?: number | string;
  optionalChargeIncluded?: boolean;
};

export function fingerprintFromPath(path: string | null | undefined) {
  return path?.match(/\/([a-f0-9]{64})-[^/]+$/u)?.[1] ?? "";
}

export function receiptMonth(value: unknown) {
  const normalized = normalizeUtilityPeriod(value);
  const month = normalized.match(/^([\p{L}]+)\s+(\d{4})(?=\s|$)/u);
  return month ? normalizeUtilityPeriod(`${month[1]} ${month[2]}`) : normalized;
}

export function receiptGrouping(
  previous: ReceiptItem[],
  existing: ReceiptItem[],
  current: { apartmentId: string; period: string; service: string; fingerprint: string },
) {
  const period = receiptMonth(current.period);
  const scoped = [...previous, ...existing].filter((item) =>
    item.apartmentId === current.apartmentId && receiptMonth(item.period) === period,
  );
  const duplicate = scoped.some((item) =>
    (item.sourceFingerprint || fingerprintFromPath(item.receiptStoragePath ?? item.receipt_storage_path)) === current.fingerprint,
  );
  const sameService = scoped.some((item) =>
    String(item.service ?? "").trim().toLocaleLowerCase("ru-RU") === current.service.trim().toLocaleLowerCase("ru-RU"),
  );
  return { items: scoped, decision: duplicate ? "duplicate" : sameService ? "possible_correction" : "new" } as const;
}

export function mandatoryTotalCents(items: ReceiptItem[]) {
  return items.reduce((sum, item) => {
    if (item.mandatory_due_minor !== undefined && item.mandatory_due_minor !== null) {
      return sum + BigInt(String(item.mandatory_due_minor));
    }
    const charged = moneyToMinor(item.mandatoryDueAmount ?? item.periodChargeAmount ?? item.tenantAmount ?? item.tenant_amount ?? item.amount) ?? BigInt(0);
    const optional = moneyToMinor(item.optionalChargeAmount ?? item.optional_charge_amount) ?? BigInt(0);
    const included = item.optionalChargeIncluded ?? item.optional_charge_included ?? false;
    return sum + charged - (item.mandatoryDueAmount === undefined && item.periodChargeAmount === undefined && included ? optional : BigInt(0));
  }, BigInt(0));
}

const russianMonths = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthForms: Record<string, number> = {
  январь: 1, января: 1, февраль: 2, февраля: 2, март: 3, марта: 3, апрель: 4, апреля: 4,
  май: 5, мая: 5, июнь: 6, июня: 6, июль: 7, июля: 7, август: 8, августа: 8,
  сентябрь: 9, сентября: 9, октябрь: 10, октября: 10, ноябрь: 11, ноября: 11, декабрь: 12, декабря: 12,
};

export function parseBillingMonth(message: string) {
  const value = message.trim().toLocaleLowerCase("ru-RU");
  const iso = value.match(/^(\d{4})[-/.](0?[1-9]|1[0-2])$/u);
  const named = value.match(/^([а-яё]+)\s+(20\d{2})$/u);
  const month = iso ? Number(iso[2]) : named ? monthForms[named[1]] : undefined;
  const year = iso ? Number(iso[1]) : named ? Number(named[2]) : undefined;
  if (!month || !year) return null;
  return {
    periodMonth: `${year}-${String(month).padStart(2, "0")}`,
    period: `${russianMonths[month - 1][0].toLocaleUpperCase("ru-RU")}${russianMonths[month - 1].slice(1)} ${year}`,
  };
}
