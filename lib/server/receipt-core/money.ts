import type { NumericToken } from "./types";

const EXACT_DECIMAL = /^[+-]?\d+(?:[.,]\d+)?$/u;
const NUMERIC_TOKEN = /[+-]?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d+)?/gu;

export function parseExactDecimal(raw: string) {
  const compact = raw.trim().replace(/[ \u00a0\u202f]/gu, "").replace(",", ".");
  if (!EXACT_DECIMAL.test(compact)) return null;
  const negative = compact.startsWith("-");
  const unsigned = compact.replace(/^[+-]/u, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const coefficient = BigInt(`${whole}${fraction}` || "0") * (negative ? BigInt(-1) : BigInt(1));
  return { coefficient, scale: fraction.length };
}

export function extractNumericTokens(cellId: string, text: string): NumericToken[] {
  return [...text.matchAll(NUMERIC_TOKEN)].flatMap((match, index) => {
    const parsed = parseExactDecimal(match[0]);
    return parsed ? [{ id: `${cellId}#${index + 1}`, cellId, raw: match[0], ...parsed }] : [];
  });
}

export function decimalToMinorExact(token: Pick<NumericToken, "coefficient" | "scale">): bigint | null {
  if (token.scale > 2) return null;
  return token.coefficient * (BigInt(10) ** BigInt(2 - token.scale));
}

export function decimalToMinorRounded(token: Pick<NumericToken, "coefficient" | "scale">): bigint {
  if (token.scale <= 2) return token.coefficient * (BigInt(10) ** BigInt(2 - token.scale));
  const divisor = BigInt(10) ** BigInt(token.scale - 2);
  const absolute = token.coefficient < BigInt(0) ? -token.coefficient : token.coefficient;
  const rounded = (absolute + divisor / BigInt(2)) / divisor;
  return token.coefficient < BigInt(0) ? -rounded : rounded;
}

export function multiplyDecimalsToMinor(left: NumericToken, right: NumericToken): bigint {
  return decimalToMinorRounded({ coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale });
}

export function minorDifference(left: bigint, right: bigint) {
  return left >= right ? left - right : right - left;
}
