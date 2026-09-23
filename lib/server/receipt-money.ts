const decimalPattern = /^-?\d+(?:[.,]\d{1,2})?$/u;

export function moneyToMinor(value: unknown): bigint | null {
  const normalized = String(value ?? "").trim().replace(/\s+/gu, "").replace(",", ".");
  if (!normalized || !decimalPattern.test(normalized)) return null;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return negative ? -minor : minor;
}

export function minorToDecimal(value: bigint) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const whole = absolute / BigInt(100);
  const fraction = String(absolute % BigInt(100)).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function formatMinor(value: unknown, currency = "RUB") {
  const minor = typeof value === "bigint" ? value : moneyToMinor(value);
  if (minor === null) return "не указано";
  const amount = Number(minor) / 100;
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
}

export function calculatedProviderDue(input: {
  currentCharge: unknown;
  openingDebt: unknown;
  openingCredit: unknown;
  paid: unknown;
}) {
  const currentCharge = moneyToMinor(input.currentCharge);
  if (currentCharge === null) return null;
  return currentCharge +
    (moneyToMinor(input.openingDebt) ?? BigInt(0)) -
    (moneyToMinor(input.openingCredit) ?? BigInt(0)) -
    (moneyToMinor(input.paid) ?? BigInt(0));
}
