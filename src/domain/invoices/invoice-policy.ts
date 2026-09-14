import {
  addDecimalAmounts,
  calculatePercentageAndRoundDecimal,
  divideAndRoundDecimal,
  fractionalDigitCount,
  multiplyAndRoundDecimal,
  normalizePositiveDecimal,
} from "../money/decimal.ts";

export type InvoiceTotals = Readonly<{ gross: string; net: string; vat: string }>;

export type InvoiceTotalTreatment =
  | Readonly<{ kind: "outside-scope" }>
  | Readonly<{ kind: "uk-taxable"; rate: string }>;

type CalculateInvoiceTotalsOptions = Readonly<{
  billableDays: string;
  dayRate: string;
  minorUnit: number;
  treatment: InvoiceTotalTreatment;
}>;

export function calculateInvoiceTotals({
  billableDays,
  dayRate,
  minorUnit,
  treatment,
}: CalculateInvoiceTotalsOptions): InvoiceTotals {
  const net = multiplyAndRoundDecimal(billableDays, dayRate, minorUnit);
  const vat =
    treatment.kind === "uk-taxable"
      ? calculatePercentageAndRoundDecimal(net, treatment.rate, minorUnit)
      : zeroCurrencyAmount(minorUnit);
  return {
    gross: addDecimalAmounts(net, vat, minorUnit),
    net,
    vat,
  };
}

type CalculateSterlingInvoiceTotalsOptions = Readonly<{
  clientCurrencyNet: string;
  exchangeRate: string;
  vatRate: string;
}>;

export function calculateSterlingInvoiceTotals({
  clientCurrencyNet,
  exchangeRate,
  vatRate,
}: CalculateSterlingInvoiceTotalsOptions): InvoiceTotals {
  const net = divideAndRoundDecimal(clientCurrencyNet, exchangeRate, 2);
  const vat = calculatePercentageAndRoundDecimal(net, vatRate, 2);
  return { gross: addDecimalAmounts(net, vat, 2), net, vat };
}

export function isPositiveCanonicalDecimal(value: string): boolean {
  const normalized = normalizePositiveDecimal(value);
  return normalized.kind === "valid" && normalized.value === value;
}

export function isPositiveQuarterDayAmount(value: string): boolean {
  if (!isPositiveCanonicalDecimal(value)) return false;
  const [, fraction = ""] = value.split(".");
  return ["", "25", "5", "50", "75"].includes(fraction);
}

export function amountFitsCurrencyPrecision(value: string, minorUnit: number): boolean {
  return fractionalDigitCount(value) <= minorUnit;
}

export function inclusiveInvoicePeriodDays(periodStart: string, periodEnd: string): number {
  return daysBetween(periodStart, periodEnd) + 1;
}

export function billableDaysExceedInvoicePeriod(
  billableDays: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  if (!isPositiveCanonicalDecimal(billableDays)) return false;
  const [whole = "0", fraction = ""] = billableDays.split(".");
  const scale = 10n ** BigInt(fraction.length);
  return (
    BigInt(`${whole}${fraction}`) >
    BigInt(inclusiveInvoicePeriodDays(periodStart, periodEnd)) * scale
  );
}

export function issueDateRequiresAcknowledgement(periodEnd: string, issueDate: string): boolean {
  return daysBetween(periodEnd, issueDate) > 14;
}

function zeroCurrencyAmount(minorUnit: number): string {
  return minorUnit === 0 ? "0" : `0.${"0".repeat(minorUnit)}`;
}

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000;
}
