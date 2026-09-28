import { mandatoryTotalCents } from "@/lib/server/telegram-receipt-state";
import { formatMinor, moneyToMinor } from "@/lib/server/receipt-money";

export function currencyLabel(value: unknown, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
  } catch {
    const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : "₽";
    return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  }
}

export function utilityDraftReply(pendingAction: Record<string, unknown>, currency: string, timezone: string) {
  if (pendingAction.type !== "create_utility_bill" && pendingAction.type !== "collect_utility_bill") return null;
  const payload = pendingAction.payload;
  if (!payload || typeof payload !== "object") return null;
  const bill = payload as Record<string, unknown>;
  const service = typeof bill.service === "string" ? bill.service.trim() : "";
  const period = typeof bill.period === "string" ? bill.period.trim() : "";
  const items = (Array.isArray(bill.items) ? bill.items : [bill])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  const latest = items.at(-1) ?? bill;
  const latestService = typeof latest.service === "string" ? latest.service.trim() : service;
  const amountMinor = moneyToMinor(latest.mandatoryDueAmount ?? latest.periodChargeAmount ?? latest.amount);
  if (!service || amountMinor === null || amountMinor <= BigInt(0)) return null;
  const dueDate = typeof latest.dueDate === "string" ? latest.dueDate.trim() : "";
  const existingItems = Array.isArray(bill.existingItems)
    ? bill.existingItems.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : [];
  const statementItems = [...existingItems, ...items];
  const mandatoryTotal = mandatoryTotalCents(statementItems);
  const hasPreviousItems = statementItems.length > 1;
  const createdAt = typeof bill.draftCreatedAt === "string" ? new Date(bill.draftCreatedAt) : null;
  const createdLabel = createdAt && !Number.isNaN(createdAt.valueOf())
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: timezone }).format(createdAt)
    : "сегодня";
  const value = (key: string) => String(latest[key] ?? "").trim();
  const moneyLine = (label: string, key: string) => value(key) ? `• ${label}: ${formatMinor(value(key), currency)}` : null;
  const lineItems = Array.isArray(latest.lineItems)
    ? latest.lineItems.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : [];
  const meters = Array.isArray(latest.meters)
    ? latest.meters.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : [];
  const optionalCharges = Array.isArray(latest.optionalCharges)
    ? latest.optionalCharges.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : [];
  const accountNumber = value("accountNumber");
  const maskedAccount = accountNumber ? `••••${accountNumber.slice(-4)}` : "";
  const extracted = [
    `${latestService} — черновик документа`,
    ...(value("providerName") ? [`Поставщик: ${value("providerName")}`] : []),
    ...(value("documentAddress") ? [`Адрес в документе: ${value("documentAddress")}`] : []),
    ...(maskedAccount ? [`Лицевой счёт: ${maskedAccount}`] : []),
    `Расчётный период: ${value("periodMonth") ? period : "не определён"}`,
    ...(value("documentDate") ? [`Дата документа: ${value("documentDate")}`] : []),
    ...(dueDate ? [`Срок оплаты: ${dueDate}`] : []),
    "",
    "Расчёт:",
    moneyLine("Начислено за период", "periodChargeAmount"),
    moneyLine("Входящий долг", "openingDebtAmount"),
    moneyLine("Входящий аванс", "openingCreditAmount"),
    moneyLine("Оплачено", "paidAmount"),
    moneyLine("Перерасчёт", "recalculationAmount"),
    moneyLine("Льготы / субсидии", "benefitAmount"),
    moneyLine("Пени", "penaltyAmount"),
    moneyLine("Напечатано к оплате", "printedDueAmount"),
    `• Обязательная сумма: ${formatMinor(amountMinor, currency)}`,
  ].filter((line): line is string => Boolean(line));
  if (lineItems.length) {
    extracted.push("", `Услуги (${lineItems.length}):`, ...lineItems.map((entry) => {
      const details = [entry.volume ? `объём ${entry.volume}` : "", entry.tariff ? `тариф ${entry.tariff}` : ""].filter(Boolean).join(", ");
      return `• ${String(entry.name ?? "Услуга")}${details ? ` — ${details}` : ""}: ${formatMinor(entry.totalAmount ?? entry.chargeAmount, currency)}`;
    }));
  }
  if (meters.length) {
    extracted.push("", `Счётчики (${meters.length}):`, ...meters.map((entry) =>
      `• ${String(entry.resource ?? "Ресурс")}${entry.meterNumber ? `, № ${entry.meterNumber}` : ""}: ${entry.previousValue || "—"} → ${entry.currentValue || "—"}${entry.consumption ? `; расход ${entry.consumption}` : ""}`,
    ));
  }
  if (optionalCharges.length) {
    extracted.push("", "Добровольные услуги (не входят в обязательный итог):", ...optionalCharges.map((entry) =>
      `• ${String(entry.label ?? "Услуга")}: ${formatMinor(entry.amount, currency)}`,
    ));
  }
  const warnings = Array.isArray(latest.warnings) ? latest.warnings.map(String).filter(Boolean) : [];
  const reviewFields = Array.isArray(latest.reviewFields) ? latest.reviewFields.map(String).filter(Boolean) : [];
  const reviewLabels: Record<string, string> = {
    provider: "поставщик",
    referenceAddress: "адрес",
    accountNumber: "лицевой счёт",
    issuedDate: "дата документа",
    dueDate: "срок оплаты",
    accruedAmount: "начисление за период",
    openingDebt: "входящий долг",
    openingAdvance: "входящий аванс",
    paymentsAppliedToCurrentPeriod: "оплаты текущего периода",
    recalculationAmount: "перерасчёт",
    benefitAmount: "льготы",
    penaltyAmount: "пени",
    "lastPayment.amount": "последний платёж",
    "lastPayment.date": "дата последнего платежа",
  };
  const reviewSummary = [...new Set(reviewFields.map((field) => {
    if (reviewLabels[field]) return reviewLabels[field];
    if (field.startsWith("lineItems.")) return "отдельные строки услуг";
    if (field.startsWith("meterEntries.")) return "показания счётчиков";
    return field;
  }))];
  if (warnings.length) extracted.push("", "Требует проверки:", ...warnings.map((warning) => `• ${warning}`));
  if (reviewSummary.length) {
    const shown = reviewSummary.slice(0, 8);
    extracted.push("", "Не удалось надёжно подтвердить:", ...shown.map((field) => `• ${field}`));
    if (reviewSummary.length > shown.length) extracted.push(`• ещё полей: ${reviewSummary.length - shown.length}`);
  }
  extracted.push("");
  if (pendingAction.type === "collect_utility_bill") {
    extracted.push("Укажите расчётный месяц и год, например: август 2026. Повторно загружать документ не нужно.");
    return extracted.join("\n");
  }
  if (hasPreviousItems) {
    extracted.push(
      existingItems.length ? `Подготовил дополнение к счёту за ${period.toLocaleLowerCase("ru-RU")}.` : `Дополнил черновик от ${createdLabel}.`,
      `• Период: за ${period.toLocaleLowerCase("ru-RU")}`,
      ...statementItems.map((entry) => `• ${String(entry.service ?? "Услуга")}: ${formatMinor(mandatoryTotalCents([entry]), currency)}`),
      `Обязательные начисления всего: ${formatMinor(mandatoryTotal, currency)}`,
      "",
    );
  } else {
    extracted.push("Черновик уже создан.", "");
  }
  extracted.push("Документ сохранён отдельным черновиком. Проверьте данные перед подтверждением.");
  return extracted.join("\n");
}
