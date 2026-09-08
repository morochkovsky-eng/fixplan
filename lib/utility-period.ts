const russianMonths = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

const monthIndexByName = new Map([
  ["январь", 0], ["января", 0],
  ["февраль", 1], ["февраля", 1],
  ["март", 2], ["марта", 2],
  ["апрель", 3], ["апреля", 3],
  ["май", 4], ["мая", 4],
  ["июнь", 5], ["июня", 5],
  ["июль", 6], ["июля", 6],
  ["август", 7], ["августа", 7],
  ["сентябрь", 8], ["сентября", 8],
  ["октябрь", 9], ["октября", 9],
  ["ноябрь", 10], ["ноября", 10],
  ["декабрь", 11], ["декабря", 11],
]);

function canonicalPeriod(monthIndex: number, year: number) {
  return `${russianMonths[monthIndex]} ${year}`;
}

export function normalizeUtilityPeriod(value: unknown) {
  const source = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!source) return "";
  const normalized = source.toLocaleLowerCase("ru-RU").replace(/^за\s+/, "");

  const isoMatch = normalized.match(/^(\d{4})[-/.](0?[1-9]|1[0-2])$/);
  if (isoMatch) return canonicalPeriod(Number(isoMatch[2]) - 1, Number(isoMatch[1]));

  const numericMatch = normalized.match(/^(0?[1-9]|1[0-2])[-/.](\d{4})$/);
  if (numericMatch) return canonicalPeriod(Number(numericMatch[1]) - 1, Number(numericMatch[2]));

  const namedMatch = normalized.match(/^([а-яё]+)\s+(\d{4})(?:\s*(?:г\.?|года))?$/i);
  const monthIndex = namedMatch ? monthIndexByName.get(namedMatch[1]) : undefined;
  if (namedMatch && monthIndex !== undefined) {
    return canonicalPeriod(monthIndex, Number(namedMatch[2]));
  }

  return source.charAt(0).toLocaleUpperCase("ru-RU") + source.slice(1);
}

export function utilityPeriodTimestamp(value: unknown) {
  const normalized = normalizeUtilityPeriod(value).toLocaleLowerCase("ru-RU");
  const match = normalized.match(/^([а-яё]+)\s+(\d{4})$/i);
  const monthIndex = match ? monthIndexByName.get(match[1]) : undefined;
  if (!match || monthIndex === undefined) return 0;
  return Date.UTC(Number(match[2]), monthIndex, 1);
}

export function recentUtilityPeriods(count = 12, now = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return canonicalPeriod(date.getUTCMonth(), date.getUTCFullYear());
  });
}
