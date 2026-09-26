import type { NumericToken } from "./types";

const EXACT_DECIMAL = /^[+-]?\d+(?:[.,]\d+)?$/u;
const NUMERIC_BODY = String.raw`(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d{1,3}(?:\.\d{3})+|\d+)(?:[.,]\d+)?`;
const NUMERIC_TOKEN = new RegExp(String.raw`\([+-]?${NUMERIC_BODY}\)|[+-]?${NUMERIC_BODY}-?`, "gu");

export function parseExactDecimal(raw: string) {
  const compact = raw.trim().replace(/[ \u00a0\u202f]/gu, "").replace(",", ".");
  if (!EXACT_DECIMAL.test(compact)) return null;
  const negative = compact.startsWith("-");
  const printedSign = negative ? "minus" as const : compact.startsWith("+") ? "plus" as const : "none" as const;
  const unsigned = compact.replace(/^[+-]/u, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const coefficient = BigInt(`${whole}${fraction}` || "0") * (negative ? BigInt(-1) : BigInt(1));
  return { coefficient, scale: fraction.length, printedSign };
}

export function parseNumericLiteral(raw: string) {
  let compact = raw.trim().replace(/[\u00a0\u202f ]/gu, "");
  let negativeWrapper = false;
  if (/^\(.+\)$/u.test(compact)) {
    negativeWrapper = true;
    compact = compact.slice(1, -1);
  }
  if (compact.endsWith("-")) {
    if (compact.startsWith("-") || compact.startsWith("+")) return null;
    negativeWrapper = true;
    compact = compact.slice(0, -1);
  }
  if (compact.includes(".") && compact.includes(",")) {
    if (!/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/u.test(compact)) return null;
    compact = compact.replaceAll(".", "");
  } else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/u.test(compact)) {
    const parsed = parseExactDecimal(compact);
    if (!parsed) return null;
    const absolute = parsed.coefficient < BigInt(0) ? -parsed.coefficient : parsed.coefficient;
    const coefficient = negativeWrapper ? -absolute : parsed.coefficient;
    return { ...parsed, coefficient, printedSign: negativeWrapper ? "minus" as const : parsed.printedSign, interpretation: "ambiguous_separator" as const };
  }
  const parsed = parseExactDecimal(compact);
  if (!parsed) return null;
  if (!negativeWrapper) return { ...parsed, interpretation: "exact" as const };
  const absolute = parsed.coefficient < BigInt(0) ? -parsed.coefficient : parsed.coefficient;
  return { ...parsed, coefficient: -absolute, printedSign: "minus" as const, interpretation: "exact" as const };
}

export function parseMoneyLiteralToMinor(raw: string) {
  const parsed = parseNumericLiteral(raw);
  if (!parsed || parsed.scale > 2) return null;
  const minor = decimalToMinorExact(parsed);
  return minor;
}

export function extractNumericTokens(cellId: string, text: string): NumericToken[] {
  return [...text.matchAll(NUMERIC_TOKEN)].flatMap((match, index) => {
    const parsed = parseNumericLiteral(match[0]);
    return parsed ? [{ id: `${cellId}#${index + 1}`, cellId, raw: match[0], ...parsed }] : [];
  });
}

export function decimalToMinorExact(token: Pick<NumericToken, "coefficient" | "scale"> & Partial<Pick<NumericToken, "interpretation">>): bigint | null {
  if (token.interpretation === "ambiguous_separator") return null;
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
