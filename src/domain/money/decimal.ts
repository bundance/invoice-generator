import { type NormalizedField, normalizeBoundedField } from "../validation/text-field.ts";

export function normalizePositiveDecimal(value: string): NormalizedField {
  const normalizedField = normalizeBoundedField(value, 200);
  if (normalizedField.kind === "invalid") return normalizedField;
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(normalizedField.value);
  const wholeDigits = match?.[1];
  if (!wholeDigits) return { kind: "invalid", message: "Enter a positive amount." };

  const fractionalDigits = (match[2] ?? "").replace(/0+$/u, "");
  if (BigInt(wholeDigits) === 0n && !/[1-9]/u.test(fractionalDigits)) {
    return { kind: "invalid", message: "Enter an amount greater than zero." };
  }

  return {
    kind: "valid",
    value: fractionalDigits
      ? `${BigInt(wholeDigits).toString()}.${fractionalDigits}`
      : BigInt(wholeDigits).toString(),
  };
}

export function fractionalDigitCount(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

export function multiplyAndRoundDecimal(
  first: string,
  second: string,
  fractionalDigits: number,
): string {
  const firstDecimal = splitDecimal(first);
  const secondDecimal = splitDecimal(second);
  const product = firstDecimal.digits * secondDecimal.digits;
  const productScale = firstDecimal.scale + secondDecimal.scale;
  const minorUnits = roundHalfUp(product, productScale, fractionalDigits);
  return formatMinorUnits(minorUnits, fractionalDigits);
}

export function divideAndRoundDecimal(
  dividend: string,
  divisor: string,
  fractionalDigits: number,
): string {
  const dividendDecimal = splitDecimal(dividend);
  const divisorDecimal = splitDecimal(divisor);
  if (divisorDecimal.digits === 0n) throw new Error("Cannot divide a decimal amount by zero");

  const numerator = dividendDecimal.digits * 10n ** BigInt(divisorDecimal.scale + fractionalDigits);
  const denominator = divisorDecimal.digits * 10n ** BigInt(dividendDecimal.scale);
  return formatMinorUnits(roundRatioHalfUp(numerator, denominator), fractionalDigits);
}

export function calculatePercentageAndRoundDecimal(
  amount: string,
  percentage: string,
  fractionalDigits: number,
): string {
  const amountDecimal = splitDecimal(amount);
  const percentageDecimal = splitDecimal(percentage);
  const numerator =
    amountDecimal.digits * percentageDecimal.digits * 10n ** BigInt(fractionalDigits);
  const denominator = 10n ** BigInt(amountDecimal.scale + percentageDecimal.scale + 2);
  return formatMinorUnits(roundRatioHalfUp(numerator, denominator), fractionalDigits);
}

export function addDecimalAmounts(first: string, second: string, fractionalDigits: number): string {
  return formatMinorUnits(
    toMinorUnits(first, fractionalDigits) + toMinorUnits(second, fractionalDigits),
    fractionalDigits,
  );
}

export function formatCurrencyAmount(
  amount: string,
  currencyCode: string,
  fractionalDigits: number,
): string {
  const [whole = "0", fraction = ""] = amount.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  return `${currencyCode} ${groupedWhole}${fractionalDigits > 0 ? `.${fraction.padEnd(fractionalDigits, "0")}` : ""}`;
}

type DecimalParts = Readonly<{ digits: bigint; scale: number }>;

function splitDecimal(value: string): DecimalParts {
  const [whole = "0", fraction = ""] = value.split(".");
  return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function roundHalfUp(value: bigint, scale: number, targetScale: number): bigint {
  if (scale <= targetScale) return value * 10n ** BigInt(targetScale - scale);

  const divisor = 10n ** BigInt(scale - targetScale);
  const quotient = value / divisor;
  const remainder = value % divisor;
  return remainder * 2n >= divisor ? quotient + 1n : quotient;
}

function roundRatioHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

function toMinorUnits(value: string, fractionalDigits: number): bigint {
  const decimal = splitDecimal(value);
  if (decimal.scale > fractionalDigits) {
    throw new Error("A decimal amount exceeds the target precision");
  }
  return decimal.digits * 10n ** BigInt(fractionalDigits - decimal.scale);
}

function formatMinorUnits(value: bigint, fractionalDigits: number): string {
  if (fractionalDigits === 0) return value.toString();

  const digits = value.toString().padStart(fractionalDigits + 1, "0");
  const wholeLength = digits.length - fractionalDigits;
  return `${digits.slice(0, wholeLength)}.${digits.slice(wholeLength)}`;
}
