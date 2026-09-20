import { z } from "zod";

import {
  addDecimalAmounts,
  calculatePercentageAndRoundDecimal,
  divideAndRoundDecimal,
} from "../money/decimal.ts";
import { persistedVatRateSchema } from "../tax/vat-rate.ts";
import { createFieldSchemas, normalizeRequiredMultiline } from "../validation/text-field.ts";
import type {
  NonEmptyReadonlyArray,
  ReviewedTaxableInvoiceServiceLine,
} from "./invoice-service-line.ts";
import { persistedExchangeRateSchema } from "./exchange-rate.ts";

export const exchangeMethods = [
  "hmrc-period-rate",
  "uk-market-selling-rate",
  "other-hmrc-approved-method",
] as const;

const exchangeEvidenceSchema = createFieldSchemas<"ExchangeEvidence">((value) =>
  normalizeRequiredMultiline(value, "Enter an exchange-rate evidence reference."),
).persisted;

export const persistedExchangeRecordSchema = z
  .strictObject({
    effectiveDate: z.iso.date(),
    evidenceReference: exchangeEvidenceSchema,
    method: z.enum(exchangeMethods),
    rate: persistedExchangeRateSchema,
  })
  .readonly()
  .brand<"ExchangeRecord">();

const sterlingAmountSchema = z
  .string()
  .max(203)
  .regex(/^(?:0|[1-9]\d*)\.\d{2}$/u);
const clientCurrencyAmountSchema = z
  .string()
  .max(203)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u);
const sterlingTotalsSchema = z
  .strictObject({
    gross: sterlingAmountSchema,
    net: sterlingAmountSchema,
    vat: sterlingAmountSchema,
  })
  .readonly();
export const persistedSterlingVatRateBucketSchema = z
  .strictObject({
    clientCurrencyNet: clientCurrencyAmountSchema,
    sterlingTotals: sterlingTotalsSchema,
    vatRate: persistedVatRateSchema,
  })
  .readonly();

export const persistedSterlingVatSummarySchema = z
  .strictObject({
    exchangeRecord: persistedExchangeRecordSchema,
    totalsByRate: z.array(persistedSterlingVatRateBucketSchema).min(1).readonly(),
    totals: sterlingTotalsSchema,
  })
  .readonly();

export type ExchangeMethod = (typeof exchangeMethods)[number];
export type ExchangeRecord = Readonly<z.output<typeof persistedExchangeRecordSchema>>;
export type SterlingVatSummary = Readonly<z.output<typeof persistedSterlingVatSummarySchema>>;

type CreateSterlingVatSummaryOptions = Readonly<{
  clientCurrencyMinorUnit: number;
  exchangeRecord: ExchangeRecord;
  serviceLines: NonEmptyReadonlyArray<ReviewedTaxableInvoiceServiceLine>;
}>;

export function createSterlingVatSummary({
  clientCurrencyMinorUnit,
  exchangeRecord,
  serviceLines,
}: CreateSterlingVatSummaryOptions): SterlingVatSummary {
  const totalsByRate = groupClientCurrencyNetByVatRate(serviceLines, clientCurrencyMinorUnit).map(
    ({ clientCurrencyNet, vatRate }) => ({
      clientCurrencyNet,
      sterlingTotals: calculateSterlingTotals(clientCurrencyNet, exchangeRecord.rate, vatRate),
      vatRate,
    }),
  );
  const totals = totalsByRate.reduce(
    (aggregate, bucket) => ({
      gross: addDecimalAmounts(aggregate.gross, bucket.sterlingTotals.gross, 2),
      net: addDecimalAmounts(aggregate.net, bucket.sterlingTotals.net, 2),
      vat: addDecimalAmounts(aggregate.vat, bucket.sterlingTotals.vat, 2),
    }),
    { gross: "0.00", net: "0.00", vat: "0.00" },
  );
  return persistedSterlingVatSummarySchema.parse({ exchangeRecord, totals, totalsByRate });
}

type SterlingVatSummaryCheckOptions = Readonly<{
  clientCurrencyMinorUnit: number;
  serviceLines: NonEmptyReadonlyArray<ReviewedTaxableInvoiceServiceLine>;
  summary: SterlingVatSummary;
  taxPoint: string;
}>;

export type SterlingVatSummaryError = Readonly<{
  message: string;
  path: readonly (number | string)[];
}>;

export function sterlingVatSummaryErrors({
  clientCurrencyMinorUnit,
  serviceLines,
  summary,
  taxPoint,
}: SterlingVatSummaryCheckOptions): readonly SterlingVatSummaryError[] {
  const errors: SterlingVatSummaryError[] = [];
  const applicabilityError = exchangeDateApplicabilityError(summary.exchangeRecord, taxPoint);
  if (applicabilityError) {
    errors.push({ message: applicabilityError, path: ["exchangeRecord", "effectiveDate"] });
  }

  const expectedSummary = createSterlingVatSummary({
    clientCurrencyMinorUnit,
    exchangeRecord: summary.exchangeRecord,
    serviceLines,
  });
  if (JSON.stringify(summary.totalsByRate) !== JSON.stringify(expectedSummary.totalsByRate)) {
    errors.push({
      message: "The immutable sterling VAT-rate totals do not match the invoice calculation.",
      path: ["totalsByRate"],
    });
  }
  for (const totalName of ["net", "vat", "gross"] as const) {
    if (summary.totals[totalName] !== expectedSummary.totals[totalName]) {
      errors.push({
        message: `The immutable sterling ${totalName} total does not match the invoice calculation.`,
        path: ["totals", totalName],
      });
    }
  }
  return errors;
}

export function exchangeDateApplicabilityError(
  exchangeRecord: Pick<ExchangeRecord, "effectiveDate" | "method">,
  taxPoint: string,
): string | null {
  if (exchangeRecord.effectiveDate > taxPoint) {
    return "The exchange-rate date cannot follow the tax point.";
  }
  if (exchangeRecord.method === "hmrc-period-rate") {
    return exchangeRecord.effectiveDate.slice(0, 7) === taxPoint.slice(0, 7)
      ? null
      : "The HMRC period rate must cover the tax point month.";
  }
  return exchangeRecord.effectiveDate === taxPoint
    ? null
    : "The exchange-rate date must match the tax point for this method.";
}

function groupClientCurrencyNetByVatRate(
  serviceLines: NonEmptyReadonlyArray<ReviewedTaxableInvoiceServiceLine>,
  minorUnit: number,
): NonEmptyReadonlyArray<Readonly<{ clientCurrencyNet: string; vatRate: string }>> {
  const zero = minorUnit === 0 ? "0" : `0.${"0".repeat(minorUnit)}`;
  const grouped = new Map<string, string>();
  for (const serviceLine of serviceLines) {
    grouped.set(
      serviceLine.vatRate,
      addDecimalAmounts(
        grouped.get(serviceLine.vatRate) ?? zero,
        serviceLine.totals.net,
        minorUnit,
      ),
    );
  }
  const [first, ...rest] = grouped.entries();
  if (!first) throw new Error("A taxable invoice must contain at least one service line");
  return [
    { clientCurrencyNet: first[1], vatRate: first[0] },
    ...rest.map(([vatRate, clientCurrencyNet]) => ({ clientCurrencyNet, vatRate })),
  ];
}

function calculateSterlingTotals(clientCurrencyNet: string, exchangeRate: string, vatRate: string) {
  const net = divideAndRoundDecimal(clientCurrencyNet, exchangeRate, 2);
  const vat = calculatePercentageAndRoundDecimal(net, vatRate, 2);
  return { gross: addDecimalAmounts(net, vat, 2), net, vat };
}
