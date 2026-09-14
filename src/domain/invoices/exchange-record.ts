import { z } from "zod";

import { createFieldSchemas, normalizeRequiredMultiline } from "../validation/text-field.ts";
import { persistedExchangeRateSchema } from "./exchange-rate.ts";
import { calculateSterlingInvoiceTotals } from "./invoice-policy.ts";

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

export const persistedSterlingVatSummarySchema = z
  .strictObject({
    exchangeRecord: persistedExchangeRecordSchema,
    totals: z
      .strictObject({
        gross: sterlingAmountSchema,
        net: sterlingAmountSchema,
        vat: sterlingAmountSchema,
      })
      .readonly(),
  })
  .readonly();

export type ExchangeMethod = (typeof exchangeMethods)[number];
export type ExchangeRecord = Readonly<z.output<typeof persistedExchangeRecordSchema>>;
export type SterlingVatSummary = Readonly<z.output<typeof persistedSterlingVatSummarySchema>>;

type SterlingVatSummaryCheckOptions = Readonly<{
  clientCurrencyNet: string;
  summary: SterlingVatSummary;
  taxPoint: string;
  vatRate: string;
}>;

export type SterlingVatSummaryError = Readonly<{
  message: string;
  path: readonly (number | string)[];
}>;

export function sterlingVatSummaryErrors({
  clientCurrencyNet,
  summary,
  taxPoint,
  vatRate,
}: SterlingVatSummaryCheckOptions): readonly SterlingVatSummaryError[] {
  const errors: SterlingVatSummaryError[] = [];
  const applicabilityError = exchangeDateApplicabilityError(summary.exchangeRecord, taxPoint);
  if (applicabilityError) {
    errors.push({
      message: applicabilityError,
      path: ["exchangeRecord", "effectiveDate"],
    });
  }

  const expectedTotals = calculateSterlingInvoiceTotals({
    clientCurrencyNet,
    exchangeRate: summary.exchangeRecord.rate,
    vatRate,
  });
  for (const totalName of ["net", "vat", "gross"] as const) {
    if (summary.totals[totalName] !== expectedTotals[totalName]) {
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
