import { z } from "zod";

import type { Currency } from "../money/currency.ts";
import {
  addDecimalAmounts,
  formatCurrencyAmount,
  normalizePositiveDecimal,
} from "../money/decimal.ts";
import { normalizeVatRate, persistedVatRateSchema } from "../tax/vat-rate.ts";
import {
  createFieldSchemas,
  normalizeRequiredMultiline,
  type NormalizedField,
} from "../validation/text-field.ts";
import {
  amountFitsCurrencyPrecision,
  billableDaysExceedInvoicePeriod,
  calculateInvoiceTotals,
  inclusiveInvoicePeriodDays,
  isPositiveQuarterDayAmount,
  type InvoiceTotals,
} from "./invoice-policy.ts";

const calendarDateSchema = z.iso.date();
const canonicalDecimalSchema = z
  .string()
  .max(200)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u);
const positiveCanonicalDecimalSchema = canonicalDecimalSchema.superRefine((value, context) => {
  const normalized = normalizePositiveDecimal(value);
  if (normalized.kind === "invalid" || normalized.value !== value) {
    context.addIssue({ code: "custom", message: "Use a canonical positive decimal." });
  }
});
const signedDecimalSchema = z
  .string()
  .max(201)
  .regex(/^(?:0(?:\.0+)?|-(?:0\.\d*[1-9]\d*|[1-9]\d*(?:\.\d+)?))$/u);
const persistedServiceDescriptionSchema = createFieldSchemas<"InvoiceServiceDescription">((value) =>
  normalizeRequiredMultiline(value, "Enter the service description."),
).persisted;
const persistedTotalsSchema = z
  .strictObject({
    gross: canonicalDecimalSchema,
    net: canonicalDecimalSchema,
    vat: canonicalDecimalSchema,
  })
  .readonly();
const persistedServiceLineFields = {
  billableDays: positiveCanonicalDecimalSchema,
  dayRate: positiveCanonicalDecimalSchema,
  periodEnd: calendarDateSchema,
  periodStart: calendarDateSchema,
  serviceDescription: persistedServiceDescriptionSchema,
  totals: persistedTotalsSchema,
} as const;
const persistedTaxableInvoiceServiceLineSchema = z
  .strictObject({ ...persistedServiceLineFields, vatRate: persistedVatRateSchema })
  .readonly();
const persistedOutsideScopeInvoiceServiceLineSchema = z
  .strictObject(persistedServiceLineFields)
  .readonly();
export const persistedInvoiceServiceLineSchema = z.union([
  persistedTaxableInvoiceServiceLineSchema,
  persistedOutsideScopeInvoiceServiceLineSchema,
]);
const signedTotalsSchema = z
  .strictObject({ gross: signedDecimalSchema, net: signedDecimalSchema, vat: signedDecimalSchema })
  .readonly();
const persistedCreditServiceLineFields = {
  ...persistedServiceLineFields,
  billableDays: signedDecimalSchema,
  totals: signedTotalsSchema,
} as const;
const persistedTaxableCreditServiceLineSchema = z
  .strictObject({ ...persistedCreditServiceLineFields, vatRate: persistedVatRateSchema })
  .readonly();
const persistedOutsideScopeCreditServiceLineSchema = z
  .strictObject(persistedCreditServiceLineFields)
  .readonly();
export const persistedCreditServiceLineSchema = z.union([
  persistedTaxableCreditServiceLineSchema,
  persistedOutsideScopeCreditServiceLineSchema,
]);

export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];

export const taxableInvoiceServiceLineInputSchema = z.strictObject({
  billableDays: z.string(),
  dayRate: z.string(),
  periodEnd: z.string(),
  periodStart: z.string(),
  serviceDescription: z.string(),
  vatRate: z.string(),
});

export const outsideScopeInvoiceServiceLineInputSchema = z.strictObject({
  billableDays: z.string(),
  dayRate: z.string(),
  periodEnd: z.string(),
  periodStart: z.string(),
  serviceDescription: z.string(),
});

export type TaxableInvoiceServiceLineInput = Readonly<
  z.output<typeof taxableInvoiceServiceLineInputSchema>
>;
export type OutsideScopeInvoiceServiceLineInput = Readonly<
  z.output<typeof outsideScopeInvoiceServiceLineInputSchema>
>;

export type InvoiceServiceLineFieldName =
  | "serviceDescription"
  | "periodStart"
  | "periodEnd"
  | "billableDays"
  | "dayRate"
  | "vatRate";

export type InvoiceServiceLineTotals = InvoiceTotals;

type ReviewedInvoiceServiceLineCommon = Readonly<{
  billableDays: string;
  dayRate: string;
  periodEnd: string;
  periodStart: string;
  serviceDescription: string;
  totals: InvoiceServiceLineTotals;
}>;

export type TaxableInvoiceServiceLine = ReviewedInvoiceServiceLineCommon &
  Readonly<{ vatRate: string }>;
export type OutsideScopeInvoiceServiceLine = ReviewedInvoiceServiceLineCommon &
  Readonly<{ vatRate?: never }>;
export type InvoiceServiceLine = TaxableInvoiceServiceLine | OutsideScopeInvoiceServiceLine;
export type ReviewedTaxableInvoiceServiceLine = TaxableInvoiceServiceLine;
export type ReviewedOutsideScopeInvoiceServiceLine = OutsideScopeInvoiceServiceLine;
export type ReviewedInvoiceServiceLine =
  | ReviewedTaxableInvoiceServiceLine
  | ReviewedOutsideScopeInvoiceServiceLine;
export type TaxableCreditNoteServiceLine = ReviewedInvoiceServiceLineCommon &
  Readonly<{ vatRate: string }>;
export type OutsideScopeCreditNoteServiceLine = ReviewedInvoiceServiceLineCommon &
  Readonly<{ vatRate?: never }>;
export type CreditNoteServiceLine =
  | TaxableCreditNoteServiceLine
  | OutsideScopeCreditNoteServiceLine;

export type ServiceLineSummary = Readonly<{
  periodEnd: string;
  periodStart: string;
  vatRates: readonly string[];
}>;

export type InvoiceServiceLineError = Readonly<{
  fieldName: InvoiceServiceLineFieldName;
  message: string;
  serviceLineIndex: number;
}>;

export type InvoiceServiceLinePreview = Readonly<{
  billableDays: string | null;
  dayRate: string | null;
  formattedDayRate: string | null;
  formattedTotals: InvoiceServiceLineTotals | null;
  periodEnd: string | null;
  periodStart: string | null;
  serviceDescription: string | null;
  totals: InvoiceServiceLineTotals | null;
  vatRate: string | null;
}>;

type ReviewInvoiceServiceLinesInput =
  | Readonly<{
      currency: Currency | undefined;
      kind: "uk-taxable";
      serviceLines: NonEmptyReadonlyArray<TaxableInvoiceServiceLineInput>;
    }>
  | Readonly<{
      currency: Currency | undefined;
      kind: "outside-scope";
      serviceLines: NonEmptyReadonlyArray<OutsideScopeInvoiceServiceLineInput>;
    }>;

export type InvoiceServiceLineReview = Readonly<{
  earliestPeriodStart: string | null;
  errors: readonly InvoiceServiceLineError[];
  latestPeriodEnd: string | null;
  previews: NonEmptyReadonlyArray<InvoiceServiceLinePreview>;
  serviceLines: NonEmptyReadonlyArray<ReviewedInvoiceServiceLine> | null;
  totals: InvoiceServiceLineTotals | null;
}>;

type NormalizedInvoiceServiceLine = Readonly<{
  billableDays: NormalizedField;
  dayRate: NormalizedField;
  periodEnd: NormalizedField;
  periodStart: NormalizedField;
  serviceDescription: NormalizedField;
  vatRate: NormalizedField | null;
}>;
type ValidNormalizedField = Extract<NormalizedField, { kind: "valid" }>;

export function reviewInvoiceServiceLines(
  input: ReviewInvoiceServiceLinesInput,
): InvoiceServiceLineReview {
  const normalizedLines = mapNonEmpty(input.serviceLines, (serviceLine) =>
    normalizeServiceLine(serviceLine, input.kind),
  );
  const errors = normalizedLines.flatMap((serviceLine, serviceLineIndex) =>
    collectServiceLineErrors(serviceLine, serviceLineIndex, input.currency),
  );
  const lineTotals = mapNonEmpty(normalizedLines, (serviceLine) =>
    calculateServiceLineMoney(serviceLine, input.currency, input.kind),
  );
  const reviewedLines = mapNonEmpty(normalizedLines, (serviceLine, index) =>
    createReviewedServiceLine(serviceLine, lineTotals[index] ?? null, input.kind),
  );
  const allLinesReviewed = reviewedLines.every((serviceLine) => serviceLine !== null);
  const serviceLines =
    errors.length === 0 && allLinesReviewed
      ? mapNonEmpty(reviewedLines, requireReviewedServiceLine)
      : null;
  const totals = lineTotals.every((lineTotal) => lineTotal !== null)
    ? sumServiceLineTotals(
        mapNonEmpty(lineTotals, requireServiceLineTotals),
        input.currency?.minorUnit ?? 0,
      )
    : null;

  return {
    earliestPeriodStart: earliestValidDate(normalizedLines.map(({ periodStart }) => periodStart)),
    errors,
    latestPeriodEnd: latestValidDate(normalizedLines.map(({ periodEnd }) => periodEnd)),
    previews: mapNonEmpty(normalizedLines, (serviceLine, index) =>
      createServiceLinePreview(serviceLine, input.currency, lineTotals[index] ?? null),
    ),
    serviceLines,
    totals,
  };
}

export function reverseIssuedInvoiceServiceLines(
  serviceLines: NonEmptyReadonlyArray<ReviewedInvoiceServiceLine>,
): NonEmptyReadonlyArray<CreditNoteServiceLine> {
  return mapNonEmpty(serviceLines, (serviceLine) => ({
    ...serviceLine,
    billableDays: negateDecimal(serviceLine.billableDays),
    totals: {
      gross: negateDecimal(serviceLine.totals.gross),
      net: negateDecimal(serviceLine.totals.net),
      vat: negateDecimal(serviceLine.totals.vat),
    },
  }));
}

export function summarizeServiceLines(
  serviceLines: NonEmptyReadonlyArray<ReviewedInvoiceServiceLine | CreditNoteServiceLine>,
): ServiceLineSummary {
  const [firstLine, ...remainingLines] = serviceLines;
  const vatRates = new Set<string>();

  for (const serviceLine of serviceLines) {
    if ("vatRate" in serviceLine) vatRates.add(serviceLine.vatRate);
  }

  return {
    periodEnd: remainingLines.reduce(
      (latest, serviceLine) => (serviceLine.periodEnd > latest ? serviceLine.periodEnd : latest),
      firstLine.periodEnd,
    ),
    periodStart: remainingLines.reduce(
      (earliest, serviceLine) =>
        serviceLine.periodStart < earliest ? serviceLine.periodStart : earliest,
      firstLine.periodStart,
    ),
    vatRates: [...vatRates],
  };
}

function normalizeServiceLine(
  serviceLine: TaxableInvoiceServiceLineInput | OutsideScopeInvoiceServiceLineInput,
  kind: ReviewInvoiceServiceLinesInput["kind"],
): NormalizedInvoiceServiceLine {
  return {
    billableDays: normalizeBillableDays(serviceLine.billableDays),
    dayRate: normalizePositiveDecimal(serviceLine.dayRate),
    periodEnd: normalizeInvoiceDate(serviceLine.periodEnd, "Enter the period end."),
    periodStart: normalizeInvoiceDate(serviceLine.periodStart, "Enter the period start."),
    serviceDescription: normalizeRequiredMultiline(
      serviceLine.serviceDescription,
      "Enter the service description.",
    ),
    vatRate:
      kind === "uk-taxable" && "vatRate" in serviceLine
        ? normalizeVatRate(serviceLine.vatRate)
        : null,
  };
}

function collectServiceLineErrors(
  serviceLine: NormalizedInvoiceServiceLine,
  serviceLineIndex: number,
  currency: Currency | undefined,
): InvoiceServiceLineError[] {
  return [
    ...fieldErrors(serviceLineIndex, "serviceDescription", serviceLine.serviceDescription),
    ...fieldErrors(serviceLineIndex, "periodStart", serviceLine.periodStart),
    ...fieldErrors(serviceLineIndex, "periodEnd", serviceLine.periodEnd),
    ...fieldErrors(serviceLineIndex, "billableDays", serviceLine.billableDays),
    ...fieldErrors(serviceLineIndex, "dayRate", serviceLine.dayRate),
    ...(serviceLine.vatRate ? fieldErrors(serviceLineIndex, "vatRate", serviceLine.vatRate) : []),
    ...periodOrderErrors(serviceLine, serviceLineIndex),
    ...billablePeriodErrors(serviceLine, serviceLineIndex),
    ...dayRatePrecisionErrors(serviceLine.dayRate, serviceLineIndex, currency),
  ];
}

function createReviewedServiceLine(
  serviceLine: NormalizedInvoiceServiceLine,
  totals: InvoiceServiceLineTotals | null,
  kind: ReviewInvoiceServiceLinesInput["kind"],
): ReviewedInvoiceServiceLine | null {
  const fields = [
    serviceLine.billableDays,
    serviceLine.dayRate,
    serviceLine.periodEnd,
    serviceLine.periodStart,
    serviceLine.serviceDescription,
  ] as const;
  if (!totals || !fields.every(isValidField)) return null;
  const dayRate = requireValidField(serviceLine.dayRate);

  const canonicalFields = {
    billableDays: requireValidField(serviceLine.billableDays),
    dayRate,
    periodEnd: requireValidField(serviceLine.periodEnd),
    periodStart: requireValidField(serviceLine.periodStart),
    serviceDescription: requireValidField(serviceLine.serviceDescription),
  };

  if (kind === "uk-taxable") {
    if (serviceLine.vatRate?.kind !== "valid") return null;
    return { ...canonicalFields, totals, vatRate: serviceLine.vatRate.value };
  }

  return { ...canonicalFields, totals };
}

function isValidField(field: NormalizedField): field is ValidNormalizedField {
  return field.kind === "valid";
}

function requireValidField(field: NormalizedField): string {
  if (field.kind === "invalid")
    throw new Error("A reviewed service line contains an invalid field");
  return field.value;
}

function calculateServiceLineMoney(
  serviceLine: NormalizedInvoiceServiceLine,
  currency: Currency | undefined,
  kind: ReviewInvoiceServiceLinesInput["kind"],
): InvoiceServiceLineTotals | null {
  const moneyFields = serviceLineMoneyFields(serviceLine, currency);
  const treatment = serviceLineVatTreatment(serviceLine, kind);
  if (!moneyFields || !treatment) return null;
  return calculateInvoiceTotals({
    ...moneyFields,
    treatment,
  });
}

function serviceLineMoneyFields(
  serviceLine: NormalizedInvoiceServiceLine,
  currency: Currency | undefined,
): Readonly<{ billableDays: string; dayRate: string; minorUnit: number }> | null {
  if (!currency) return null;
  if (serviceLine.billableDays.kind !== "valid" || serviceLine.dayRate.kind !== "valid")
    return null;
  if (!amountFitsCurrencyPrecision(serviceLine.dayRate.value, currency.minorUnit)) return null;
  if (billablePeriodErrors(serviceLine, 0).length > 0) return null;
  return {
    billableDays: serviceLine.billableDays.value,
    dayRate: serviceLine.dayRate.value,
    minorUnit: currency.minorUnit,
  };
}

function serviceLineVatTreatment(
  serviceLine: NormalizedInvoiceServiceLine,
  kind: ReviewInvoiceServiceLinesInput["kind"],
): Readonly<{ kind: "outside-scope" }> | Readonly<{ kind: "uk-taxable"; rate: string }> | null {
  if (kind === "outside-scope") return { kind: "outside-scope" };
  return serviceLine.vatRate?.kind === "valid"
    ? { kind: "uk-taxable", rate: serviceLine.vatRate.value }
    : null;
}

function createServiceLinePreview(
  serviceLine: NormalizedInvoiceServiceLine,
  currency: Currency | undefined,
  totals: InvoiceServiceLineTotals | null,
): InvoiceServiceLinePreview {
  return {
    billableDays: validValue(serviceLine.billableDays),
    dayRate: validValue(serviceLine.dayRate),
    formattedDayRate:
      currency &&
      serviceLine.dayRate.kind === "valid" &&
      amountFitsCurrencyPrecision(serviceLine.dayRate.value, currency.minorUnit)
        ? formatCurrencyAmount(serviceLine.dayRate.value, currency.code, currency.minorUnit)
        : null,
    formattedTotals: currency && totals ? formatServiceLineTotals(totals, currency) : null,
    periodEnd: validValue(serviceLine.periodEnd),
    periodStart: validValue(serviceLine.periodStart),
    serviceDescription: validValue(serviceLine.serviceDescription),
    totals,
    vatRate: serviceLine.vatRate ? validValue(serviceLine.vatRate) : null,
  };
}

function formatServiceLineTotals(
  totals: InvoiceServiceLineTotals,
  currency: Currency,
): InvoiceServiceLineTotals {
  return {
    gross: formatCurrencyAmount(totals.gross, currency.code, currency.minorUnit),
    net: formatCurrencyAmount(totals.net, currency.code, currency.minorUnit),
    vat: formatCurrencyAmount(totals.vat, currency.code, currency.minorUnit),
  };
}

function fieldErrors(
  serviceLineIndex: number,
  fieldName: InvoiceServiceLineFieldName,
  field: NormalizedField,
): readonly InvoiceServiceLineError[] {
  return field.kind === "invalid" ? [{ fieldName, message: field.message, serviceLineIndex }] : [];
}

function periodOrderErrors(
  serviceLine: NormalizedInvoiceServiceLine,
  serviceLineIndex: number,
): readonly InvoiceServiceLineError[] {
  return serviceLine.periodStart.kind === "valid" &&
    serviceLine.periodEnd.kind === "valid" &&
    serviceLine.periodStart.value > serviceLine.periodEnd.value
    ? [
        {
          fieldName: "periodEnd",
          message: "The period end cannot precede its start.",
          serviceLineIndex,
        },
      ]
    : [];
}

function billablePeriodErrors(
  serviceLine: NormalizedInvoiceServiceLine,
  serviceLineIndex: number,
): readonly InvoiceServiceLineError[] {
  if (
    serviceLine.periodStart.kind === "invalid" ||
    serviceLine.periodEnd.kind === "invalid" ||
    serviceLine.billableDays.kind === "invalid"
  ) {
    return [];
  }
  const availableDays = inclusiveInvoicePeriodDays(
    serviceLine.periodStart.value,
    serviceLine.periodEnd.value,
  );
  const dayLabel = availableDays === 1 ? "day" : "days";
  return billableDaysExceedInvoicePeriod(
    serviceLine.billableDays.value,
    serviceLine.periodStart.value,
    serviceLine.periodEnd.value,
  )
    ? [
        {
          fieldName: "billableDays",
          message: `Billable days cannot exceed the ${availableDays} ${dayLabel} in the service period.`,
          serviceLineIndex,
        },
      ]
    : [];
}

function dayRatePrecisionErrors(
  dayRate: NormalizedField,
  serviceLineIndex: number,
  currency: Currency | undefined,
): readonly InvoiceServiceLineError[] {
  if (!currency || dayRate.kind === "invalid") return [];
  return amountFitsCurrencyPrecision(dayRate.value, currency.minorUnit)
    ? []
    : [
        {
          fieldName: "dayRate",
          message: `Use no more than ${currency.minorUnit} decimal places for ${currency.code}.`,
          serviceLineIndex,
        },
      ];
}

function normalizeBillableDays(value: string): NormalizedField {
  const positiveDecimal = normalizePositiveDecimal(value);
  if (positiveDecimal.kind === "invalid") {
    return { kind: "invalid", message: "Enter positive billable days." };
  }
  return isPositiveQuarterDayAmount(positiveDecimal.value)
    ? positiveDecimal
    : { kind: "invalid", message: "Use quarter-day increments." };
}

export function normalizeInvoiceDate(value: string, requiredMessage: string): NormalizedField {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) return { kind: "invalid", message: requiredMessage };
  return z.iso.date().safeParse(normalized).success
    ? { kind: "valid", value: normalized }
    : { kind: "invalid", message: "Enter a real calendar date." };
}

function sumServiceLineTotals(
  serviceLineTotals: NonEmptyReadonlyArray<InvoiceServiceLineTotals>,
  minorUnit: number,
): InvoiceServiceLineTotals {
  const zero = minorUnit === 0 ? "0" : `0.${"0".repeat(minorUnit)}`;
  return serviceLineTotals.reduce<InvoiceServiceLineTotals>(
    (totals, serviceLine) => ({
      gross: addDecimalAmounts(totals.gross, serviceLine.gross, minorUnit),
      net: addDecimalAmounts(totals.net, serviceLine.net, minorUnit),
      vat: addDecimalAmounts(totals.vat, serviceLine.vat, minorUnit),
    }),
    { gross: zero, net: zero, vat: zero },
  );
}

function requireServiceLineTotals(
  totals: InvoiceServiceLineTotals | null,
): InvoiceServiceLineTotals {
  if (!totals) throw new Error("A complete money review contains unavailable totals");
  return totals;
}

function validValue(field: NormalizedField): string | null {
  return field.kind === "valid" ? field.value : null;
}

function earliestValidDate(fields: readonly NormalizedField[]): string | null {
  const values = fields.flatMap((field) => (field.kind === "valid" ? [field.value] : []));
  return values.length === fields.length
    ? values.reduce((earliest, value) => (value < earliest ? value : earliest))
    : null;
}

function latestValidDate(fields: readonly NormalizedField[]): string | null {
  const values = fields.flatMap((field) => (field.kind === "valid" ? [field.value] : []));
  return values.length === fields.length
    ? values.reduce((latest, value) => (value > latest ? value : latest))
    : null;
}

function requireReviewedServiceLine(
  serviceLine: ReviewedInvoiceServiceLine | null,
): ReviewedInvoiceServiceLine {
  if (!serviceLine) throw new Error("A validated service-line review contains an invalid line");
  return serviceLine;
}

function mapNonEmpty<Input, Output>(
  [first, ...rest]: NonEmptyReadonlyArray<Input>,
  transform: (value: Input, index: number) => Output,
): NonEmptyReadonlyArray<Output> {
  return [transform(first, 0), ...rest.map((value, index) => transform(value, index + 1))];
}

function negateDecimal(value: string): string {
  if (/^0(?:\.0+)?$/u.test(value)) return value;
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}
