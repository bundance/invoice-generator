import { z } from "zod";

import { normalizeRequiredMultiline, type NormalizedField } from "../validation/text-field.ts";
import { normalizeExchangeRate } from "./exchange-rate.ts";
import {
  exchangeDateApplicabilityError,
  exchangeMethods,
  persistedExchangeRecordSchema,
  persistedSterlingVatSummarySchema,
  type SterlingVatSummary,
} from "./exchange-record.ts";
import { calculateSterlingInvoiceTotals, type InvoiceTotals } from "./invoice-policy.ts";

export const exchangeDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("not-required") }),
  z.strictObject({
    effectiveDate: z.string(),
    evidenceReference: z.string(),
    kind: z.literal("required"),
    method: z.string(),
    rate: z.string(),
  }),
]);

export type ExchangeDraftInput = Readonly<z.output<typeof exchangeDraftSchema>>;

export type ExchangeDraftFieldName =
  | "exchangeEffectiveDate"
  | "exchangeEvidenceReference"
  | "exchangeMethod"
  | "exchangeRate";

export type ExchangeDraftError = Readonly<{
  fieldName: ExchangeDraftFieldName;
  message: string;
}>;

export type ExchangeReview =
  | Readonly<{
      errors: readonly ExchangeDraftError[];
      kind: "invalid";
      sterlingVatSummary: null;
    }>
  | Readonly<{
      errors: readonly [];
      kind: "not-required";
      sterlingVatSummary: null;
    }>
  | Readonly<{
      errors: readonly [];
      kind: "valid";
      sterlingVatSummary: SterlingVatSummary;
    }>;

type ReviewExchangeOptions = Readonly<{
  currencyCode: string | undefined;
  exchange: ExchangeDraftInput;
  taxPoint: NormalizedField;
  totals: InvoiceTotals | null;
  vatRate: NormalizedField;
}>;

export function createExchangeDraft(currencyCode: string): ExchangeDraftInput {
  return currencyCode === "GBP"
    ? { kind: "not-required" }
    : {
        effectiveDate: "",
        evidenceReference: "",
        kind: "required",
        method: "",
        rate: "",
      };
}

export function exchangeDraftMatchesCurrency(
  exchange: ExchangeDraftInput,
  currencyCode: string,
): boolean {
  return (currencyCode === "GBP") === (exchange.kind === "not-required");
}

export function exchangeDraftInputsAreEqual(
  first: ExchangeDraftInput,
  second: ExchangeDraftInput,
): boolean {
  if (first.kind !== second.kind) return false;
  if (first.kind === "not-required" && second.kind === "not-required") return true;
  return (
    first.kind === "required" &&
    second.kind === "required" &&
    first.effectiveDate === second.effectiveDate &&
    first.evidenceReference === second.evidenceReference &&
    first.method === second.method &&
    first.rate === second.rate
  );
}

export function reviewExchange({
  currencyCode,
  exchange,
  taxPoint,
  totals,
  vatRate,
}: ReviewExchangeOptions): ExchangeReview {
  if (currencyCode === "GBP") {
    return { errors: [], kind: "not-required", sterlingVatSummary: null };
  }

  if (!currencyCode || exchange.kind === "not-required") {
    return {
      errors:
        currencyCode && exchange.kind === "not-required"
          ? [{ fieldName: "exchangeRate", message: "Enter foreign-currency exchange evidence." }]
          : [],
      kind: "invalid",
      sterlingVatSummary: null,
    };
  }

  const fields = normalizeExchangeDraft(exchange);
  const errors = exchangeDraftErrors(fields, taxPoint);
  if (
    errors.length > 0 ||
    !totals ||
    vatRate.kind === "invalid" ||
    taxPoint.kind === "invalid" ||
    fields.effectiveDate.kind === "invalid" ||
    fields.evidenceReference.kind === "invalid" ||
    fields.method.kind === "invalid" ||
    fields.rate.kind === "invalid"
  ) {
    return { errors, kind: "invalid", sterlingVatSummary: null };
  }

  const exchangeRecordResult = persistedExchangeRecordSchema.safeParse({
    effectiveDate: fields.effectiveDate.value,
    evidenceReference: fields.evidenceReference.value,
    method: fields.method.value,
    rate: fields.rate.value,
  });
  if (!exchangeRecordResult.success) {
    return invalidExchangeReview("Enter valid exchange evidence.");
  }

  const sterlingVatSummaryResult = persistedSterlingVatSummarySchema.safeParse({
    exchangeRecord: exchangeRecordResult.data,
    totals: calculateSterlingInvoiceTotals({
      clientCurrencyNet: totals.net,
      exchangeRate: exchangeRecordResult.data.rate,
      vatRate: vatRate.value,
    }),
  });
  if (!sterlingVatSummaryResult.success) {
    return invalidExchangeReview("Use an exchange rate that produces storable sterling totals.");
  }

  return {
    errors: [],
    kind: "valid",
    sterlingVatSummary: sterlingVatSummaryResult.data,
  };
}

function invalidExchangeReview(message: string): ExchangeReview {
  return {
    errors: [{ fieldName: "exchangeRate", message }],
    kind: "invalid",
    sterlingVatSummary: null,
  };
}

type NormalizedExchangeDraft = Readonly<{
  effectiveDate: NormalizedField;
  evidenceReference: NormalizedField;
  method: NormalizedField;
  rate: NormalizedField;
}>;

function normalizeExchangeDraft(
  exchange: Extract<ExchangeDraftInput, { kind: "required" }>,
): NormalizedExchangeDraft {
  return {
    effectiveDate: normalizeExchangeDate(exchange.effectiveDate),
    evidenceReference: normalizeRequiredMultiline(
      exchange.evidenceReference,
      "Enter an exchange-rate evidence reference.",
    ),
    method: normalizeExchangeMethod(exchange.method),
    rate: normalizeExchangeRate(exchange.rate),
  };
}

function exchangeDraftErrors(
  fields: NormalizedExchangeDraft,
  taxPoint: NormalizedField,
): readonly ExchangeDraftError[] {
  const errors: ExchangeDraftError[] = [
    ...exchangeFieldError("exchangeRate", fields.rate),
    ...exchangeFieldError("exchangeEffectiveDate", fields.effectiveDate),
    ...exchangeFieldError("exchangeMethod", fields.method),
    ...exchangeFieldError("exchangeEvidenceReference", fields.evidenceReference),
  ];
  if (fields.effectiveDate.kind === "valid" && fields.method.kind === "valid") {
    const methodResult = z.enum(exchangeMethods).safeParse(fields.method.value);
    if (methodResult.success && taxPoint.kind === "valid") {
      const message = exchangeDateApplicabilityError(
        { effectiveDate: fields.effectiveDate.value, method: methodResult.data },
        taxPoint.value,
      );
      if (message) errors.push({ fieldName: "exchangeEffectiveDate", message });
    }
  }
  return errors;
}

function normalizeExchangeDate(value: string): NormalizedField {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) {
    return { kind: "invalid", message: "Enter the exchange-rate effective date." };
  }
  return z.iso.date().safeParse(normalized).success
    ? { kind: "valid", value: normalized }
    : { kind: "invalid", message: "Enter a real calendar date." };
}

function normalizeExchangeMethod(value: string): NormalizedField {
  const normalized = value.normalize("NFC").trim();
  return exchangeMethods.some((method) => method === normalized)
    ? { kind: "valid", value: normalized }
    : { kind: "invalid", message: "Choose an approved exchange-rate method." };
}

function exchangeFieldError(
  fieldName: ExchangeDraftFieldName,
  result: NormalizedField,
): readonly ExchangeDraftError[] {
  return result.kind === "invalid" ? [{ fieldName, message: result.message }] : [];
}
