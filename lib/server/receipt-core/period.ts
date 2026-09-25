import type { BillingPeriodField, LiteralCell, ValidatedRoleItem } from "./types";

const MONTHS = new Map<string, number>([
  ["январь", 1], ["января", 1], ["февраль", 2], ["февраля", 2],
  ["март", 3], ["марта", 3], ["апрель", 4], ["апреля", 4],
  ["май", 5], ["мая", 5], ["июнь", 6], ["июня", 6],
  ["июль", 7], ["июля", 7], ["август", 8], ["августа", 8],
  ["сентябрь", 9], ["сентября", 9], ["октябрь", 10], ["октября", 10],
  ["ноябрь", 11], ["ноября", 11], ["декабрь", 12], ["декабря", 12],
]);

function year(value: string) {
  const parsed = Number(value);
  return value.length === 2 ? 2000 + parsed : parsed;
}

function format(month: number, fullYear: number) {
  if (month < 1 || month > 12 || fullYear < 2000 || fullYear > 9999) return null;
  return `${fullYear}-${String(month).padStart(2, "0")}`;
}

export function parseBillingPeriodText(text: string): { status: "parsed" | "ambiguous" | "unsupported"; candidates: string[] } {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/\s+/gu, " ").trim();
  const candidates = new Set<string>();

  for (const match of normalized.matchAll(/(?<!\d)(0?[1-9]|1[0-2])[./](\d{2}|\d{4})(?![\d./-])/gu)) {
    const value = format(Number(match[1]), year(match[2]));
    if (value) candidates.add(value);
  }
  for (const match of normalized.matchAll(/(?<![а-яё])(январ(?:ь|я)|феврал(?:ь|я)|март(?:а)?|апрел(?:ь|я)|ма(?:й|я)|июн(?:ь|я)|июл(?:ь|я)|август(?:а)?|сентябр(?:ь|я)|октябр(?:ь|я)|ноябр(?:ь|я)|декабр(?:ь|я))\s+(\d{2}|\d{4})(?!\d)/gu)) {
    const value = format(MONTHS.get(match[1])!, year(match[2]));
    if (value) candidates.add(value);
  }
  for (const match of normalized.matchAll(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?!\d)/gu)) {
    const value = format(Number(match[2]), year(match[3]));
    if (value) candidates.add(value);
  }

  const values = [...candidates].sort();
  if (values.length === 1) return { status: "parsed", candidates: values };
  if (values.length > 1) return { status: "ambiguous", candidates: values };
  return { status: "unsupported", candidates: [] };
}

export function buildBillingPeriod(
  items: ValidatedRoleItem[],
  cells: Map<string, LiteralCell>,
): BillingPeriodField {
  const periodItems = items.filter((item) => item.role === "billing_period" || item.role === "period");
  if (periodItems.length === 0) return { state: "absent", value: null, sourceCellIds: [], sourceTokenIds: [], parseStatus: "missing", candidates: [] };
  const sourceCellIds = [...new Set(periodItems.flatMap((item) => (item.slots.billing_period ?? item.slots.period)?.cellIds ?? []))].sort();
  const sourceTokenIds = [...new Set(periodItems.flatMap((item) => (item.slots.billing_period ?? item.slots.period)?.tokenIds ?? []))].sort();
  const sourceCells = sourceCellIds.flatMap((id) => cells.get(id) ?? []);
  if (sourceCells.some((cell) => cell.state === "illegible")) {
    return { state: "illegible", value: null, sourceCellIds, sourceTokenIds, parseStatus: "illegible", candidates: [] };
  }
  if (!sourceCells.some((cell) => cell.state === "present" && cell.text.trim())) {
    const state = sourceCells.some((cell) => cell.state === "blank") ? "printed_blank" : "absent";
    return { state, value: null, sourceCellIds, sourceTokenIds, parseStatus: state === "absent" ? "missing" : "unsupported", candidates: [] };
  }
  const results = sourceCells.filter((cell) => cell.state === "present").map((cell) => parseBillingPeriodText(cell.text));
  const candidates = [...new Set(results.flatMap((result) => result.candidates))].sort();
  const status = results.some((result) => result.status === "ambiguous") || candidates.length > 1
    ? "ambiguous"
    : candidates.length === 1 ? "parsed" : "unsupported";
  return { state: "printed", value: status === "parsed" ? candidates[0] : null, sourceCellIds, sourceTokenIds, parseStatus: status, candidates };
}
