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
  if (pendingAction.type !== "create_utility_bill") return null;
  const payload = pendingAction.payload;
  if (!payload || typeof payload !== "object") return null;
  const bill = payload as Record<string, unknown>;
  const service = typeof bill.service === "string" ? bill.service.trim() : "";
  const period = typeof bill.period === "string" ? bill.period.trim() : "";
  const items = (Array.isArray(bill.items) ? bill.items : [bill])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
  const latest = items.at(-1) ?? bill;
  const latestService = typeof latest.service === "string" ? latest.service.trim() : service;
  const amount = Number(latest.amount);
  if (!service || !period || !Number.isFinite(amount) || amount <= 0) return null;
  const tenantAmount = Number(latest.tenantAmount ?? amount);
  const optionalChargeLabel = typeof latest.optionalChargeLabel === "string" ? latest.optionalChargeLabel.trim() : "";
  const optionalChargeAmount = Number(latest.optionalChargeAmount ?? 0);
  const optionalChargeIncluded = Boolean(latest.optionalChargeIncluded && optionalChargeAmount > 0);
  const dueDate = typeof latest.dueDate === "string" ? latest.dueDate.trim() : "";
  const existingItems = Array.isArray(bill.existingItems)
    ? bill.existingItems.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : [];
  const statementItems = [
    ...existingItems.map((entry) => ({ service: entry.service, tenantAmount: entry.tenant_amount })),
    ...items.map((entry) => ({ service: entry.service, tenantAmount: entry.tenantAmount })),
  ];
  const tenantTotal = statementItems.reduce((sum, entry) => sum + Number(entry.tenantAmount ?? 0), 0);
  const hasPreviousItems = statementItems.length > 1;
  const createdAt = typeof bill.draftCreatedAt === "string" ? new Date(bill.draftCreatedAt) : null;
  const createdLabel = createdAt && !Number.isNaN(createdAt.valueOf())
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: timezone }).format(createdAt)
    : "сегодня";
  const extracted = [
    `Что удалось извлечь из вложения (${latestService}, ${period.toLocaleLowerCase("ru-RU")}):`,
    `• Период начисления: за ${period.toLocaleLowerCase("ru-RU")}`,
    `• Начислено за месяц: ${currencyLabel(amount, currency)}`,
    ...(optionalChargeLabel && optionalChargeAmount > 0
      ? [`• ${optionalChargeLabel}: ${currencyLabel(optionalChargeAmount, currency)} (${optionalChargeIncluded ? "включено" : "исключено"})`]
      : []),
    ...(dueDate ? [`• Срок оплаты: ${dueDate}`] : []),
    `Жилец должен: ${currencyLabel(tenantAmount, currency)}`,
    "",
  ];
  if (hasPreviousItems) {
    extracted.push(
      existingItems.length ? `Подготовил дополнение к счёту за ${period.toLocaleLowerCase("ru-RU")}.` : `Дополнил черновик от ${createdLabel}.`,
      `• Период: за ${period.toLocaleLowerCase("ru-RU")}`,
      ...statementItems.map((entry) => `• ${String(entry.service ?? "Услуга")}: ${currencyLabel(entry.tenantAmount, currency)}`),
      `Жилец должен всего: ${currencyLabel(tenantTotal, currency)}`,
      "",
    );
  } else {
    extracted.push("Черновик уже создан.", "");
  }
  extracted.push("Чтобы добавить другие ресурсы, пришлите дополнительные квитанции.");
  return extracted.join("\n");
}
