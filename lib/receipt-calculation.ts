export type ReceiptLine = {
  label: string;
  amount: string;
  kind: "service" | "penalty" | "insurance" | "optional";
};

export type ReceiptExtraction = {
  isReceipt: boolean;
  service: string;
  providerKey: string | null;
  documentDate: string | null;
  documentPeriod: string | null;
  requestedPeriod: string | null;
  currency: string;
  accrued: string | null;
  accruedConfident: boolean;
  payable: string | null;
  credit: string | null;
  debt: string | null;
  dueDate: string | null;
  lines: ReceiptLine[];
  linesComplete: boolean;
  repeatedPanel: boolean;
  warnings: string[];
};

export type ReceiptPolicy = {
  id: string;
  excludePenalties: boolean | null;
  periodOffset: number | null;
  optionalIncluded: boolean;
};

// Accept only normalized decimal strings, never ambiguous thousands separators.
export function receiptMinor(value: string | null): number | null {
  if (value === null || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : null;
}

export function shiftReceiptPeriod(period: string | null, offset: number) {
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function calculateReceipt(raw: ReceiptExtraction, policy: ReceiptPolicy) {
  const problems = [...raw.warnings];
  const accruedMinor = receiptMinor(raw.accrued);
  if (!raw.accruedConfident || accruedMinor === null || accruedMinor <= 0) {
    problems.push("Не удалось уверенно прочитать «Начислено». Сумма «К оплате» не используется вместо него.");
  }
  if (!["RUB", "EUR", "USD"].includes(raw.currency)) problems.push("Нужна проверка валюты и её денежной точности перед расчётом.");
  const rows = raw.lines.map((line) => ({ ...line, minor: receiptMinor(line.amount) }));
  const rowTotalMinor = rows.every((row) => row.minor !== null)
    ? rows.reduce((sum, row) => sum + row.minor!, 0) : null;
  if (!raw.linesComplete || !rows.length || rowTotalMinor === null) {
    problems.push("Не все строки начислений прочитаны: нужна проверка квитанции.");
  } else if (rowTotalMinor !== accruedMinor) {
    problems.push(`Сумма строк (${rowTotalMinor} коп.) не совпадает с начислением (${accruedMinor} коп.).`);
  }
  const penalties = rows.filter((row) => row.kind === "penalty");
  if (penalties.length && policy.excludePenalties === null) {
    problems.push("Подтвердите правило для квартиры: пени оплачивает собственник или жилец?");
  }
  const tenantPeriod = shiftReceiptPeriod(raw.documentPeriod, policy.periodOffset ?? 0);
  if (!tenantPeriod) problems.push("Не удалось определить период документа.");
  if (raw.requestedPeriod && raw.requestedPeriod !== tenantPeriod) {
    problems.push("Период запроса отличается от периода документа и сохранённого правила. Уточните период выставления жильцу.");
  }
  const exclusions = rows.filter((row) =>
    (row.kind === "penalty" && policy.excludePenalties === true) ||
    (row.kind === "insurance" && !policy.optionalIncluded));
  const excludedMinor = exclusions.reduce((sum, row) => sum + (row.minor ?? 0), 0);
  const result = accruedMinor === null ? null : accruedMinor - excludedMinor;
  if (result !== null && result < 0) problems.push("Исключения превышают начисление.");
  return {
    version: 1, raw, policy, accruedMinor, rowTotalMinor, exclusions,
    creditMinor: receiptMinor(raw.credit), payableMinor: receiptMinor(raw.payable),
    debtMinor: receiptMinor(raw.debt), excludedMinor, tenantPeriod,
    periodRule: policy.periodOffset === null ? "document_period" : `${policy.id}:offset=${policy.periodOffset}`,
    formula: `${accruedMinor} - ${excludedMinor} = ${result} (коп.)`,
    problems, tenantMinor: problems.length ? null : result,
  };
}

export type ReceiptCalculation = ReturnType<typeof calculateReceipt>;

export function receiptExceptionAgreement(raw: ReceiptExtraction, checked: ReceiptLine[]) {
  return (["penalty", "insurance"] as const).every((kind) => {
    const signature = (rows: ReceiptLine[]) => rows.filter((line) => line.kind === kind)
      .map((line) => receiptMinor(line.amount)).sort((a, b) => (a ?? 0) - (b ?? 0));
    return JSON.stringify(signature(raw.lines)) === JSON.stringify(signature(checked));
  });
}

export function receiptMoney(minor: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}

export function renderReceiptCalculation(calculation: ReceiptCalculation) {
  const { raw, tenantPeriod, accruedMinor, exclusions, creditMinor, tenantMinor, problems } = calculation;
  const money = (minor: number) => /^[A-Z]{3}$/.test(raw.currency) ? receiptMoney(minor, raw.currency) : `${minor} (денежная единица не определена)`;
  const period = tenantPeriod ? new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${tenantPeriod}-01T00:00:00Z`)).replace(/\s*г\.$/, "") : "неуточнённый период";
  return [
    `${raw.service} за ${period}`,
    `Начислено по квитанции: ${accruedMinor === null ? "не прочитано" : money(accruedMinor)}`,
    ...(tenantMinor === null ? [] : exclusions.map((line) => `Исключено: ${line.label} — ${money(line.minor ?? 0)}, расходы собственника`)),
    ...(creditMinor ? [`Переплата ${money(creditMinor)} не учитывается в расчёте жильцу`] : []),
    ...(tenantMinor === null ? problems : [`Итого жильцу: ${money(tenantMinor)}`]),
  ].join("\n");
}
