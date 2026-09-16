import { createHash } from "node:crypto";

export type StatementBill = {
  id: string;
  service: string;
  period: string;
  tenant_amount: number;
  reimbursement_status: string;
  due_date_label?: string | null;
  status: string;
};

export function buildTenantStatement(
  apartmentName: string,
  period: string,
  currency: string,
  bills: StatementBill[],
) {
  const items = bills
    .filter(
      (bill) =>
        bill.status !== "draft" &&
        Number(bill.tenant_amount) > 0 &&
        bill.reimbursement_status !== "received",
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!items.length) return null;
  const money = (amount: number) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
      amount,
    );
  const cents = (value: number) => Math.round(Number(value) * 100);
  const total =
    items.reduce((sum, bill) => sum + cents(bill.tenant_amount), 0) / 100;
  const body = [
    `Коммунальные платежи · ${period}`,
    apartmentName,
    "",
    ...items.map(
      (bill) =>
        `${bill.service}: ${money(Number(bill.tenant_amount))}${bill.due_date_label ? ` · оплатить до ${bill.due_date_label}` : ""}`,
    ),
    "",
    `К оплате: ${money(total)}`,
  ].join("\n");
  if (!Number.isFinite(total) || body.length > 3900)
    throw new Error(
      "Не удалось составить компактный счёт. Проверьте начисления в разделе «Счета».",
    );
  return {
    body,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          period,
          currency,
          apartmentName,
          items: items.map((bill) => [
            bill.id,
            bill.service,
            cents(bill.tenant_amount),
            bill.due_date_label ?? "",
          ]),
        }),
      )
      .digest("hex"),
  };
}

export function statementDecision(
  text: string,
): "send" | "cancel" | "copy" | null {
  const value = text
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[.!?]+$/u, "");
  if (
    /^(да(?:,?\s+(?:отправляем|отправляй|отправь))?|отправляем|отправляй|отправь(?:\s+(?:сч[её]т\s+)?в\s+группу)?|давай отправим|подтверждаю)$/u.test(
      value,
    )
  )
    return "send";
  if (
    /^(нет|не отправляй|не отправлять|отмена|позже|пока нет|оставить у меня)$/u.test(
      value,
    )
  )
    return "cancel";
  if (
    /^(копировать|скопировать|текст для копирования|сам отправлю)$/u.test(value)
  )
    return "copy";
  return null;
}
