import { z } from "zod";

import type { Client, ClientId } from "../clients/client.ts";
import { formatDocumentId } from "../clients/client.ts";
import { findCurrency, persistedCurrencySchema, type Currency } from "../money/currency.ts";
import { formatCurrencyAmount, normalizePositiveDecimal } from "../money/decimal.ts";
import type { IssuerSettings } from "../issuer/issuer-settings.ts";
import type { BusinessDate } from "../time/business-date.ts";
import {
  normalizeOptionalMultiline,
  normalizeOptionalSingleLine,
  normalizeRequiredMultiline,
  normalizeRequiredSingleLine,
  type NormalizedField,
} from "../validation/text-field.ts";
import { normalizeVatRate } from "../tax/vat-rate.ts";
import { outsideScopeVatWording, ukTaxableWording } from "../tax/vat-wording.ts";
import { invoiceDraftCommonFieldsSchema } from "./invoice-draft-common-fields.ts";
import {
  createExchangeDraft,
  exchangeDraftInputsAreEqual,
  exchangeDraftMatchesCurrency,
  exchangeDraftSchema,
  reviewExchange,
  type ExchangeDraftFieldName,
  type ExchangeReview,
} from "./exchange-draft.ts";
import type { SterlingVatSummary } from "./exchange-record.ts";
import {
  amountFitsCurrencyPrecision,
  billableDaysExceedInvoicePeriod,
  calculateInvoiceTotals,
  inclusiveInvoicePeriodDays,
  isPositiveQuarterDayAmount,
  issueDateRequiresAcknowledgement,
  type InvoiceTotals,
  type InvoiceTotalTreatment,
} from "./invoice-policy.ts";
import {
  persistedInvoiceVatTreatmentSchema,
  type InvoiceVatTreatment,
} from "./invoice-vat-treatment.ts";
import { persistedInvoiceTaxFactsSchema, type InvoiceTaxFacts } from "./invoice-tax-facts.ts";

const invoiceDraftFieldsSchema = z
  .discriminatedUnion("vatTreatment", [
    invoiceDraftCommonFieldsSchema.extend({
      exchange: exchangeDraftSchema,
      vatTreatment: z.literal("uk-taxable"),
      vatRate: z.string(),
      taxPoint: z.string(),
    }),
    invoiceDraftCommonFieldsSchema.extend({
      vatTreatment: z.literal("outside-scope"),
      outsideScopeEvidenceReference: z.string(),
      reverseCharge: z.boolean(),
    }),
  ])
  .superRefine((draft, context) => {
    if (
      draft.vatTreatment === "uk-taxable" &&
      !exchangeDraftMatchesCurrency(draft.exchange, draft.currencyCode)
    ) {
      context.addIssue({
        code: "custom",
        message: "The exchange draft does not match the invoice currency.",
        path: ["exchange"],
      });
    }
  });
const commonInvoiceDraftFieldNames = invoiceDraftCommonFieldsSchema.keyof().options;

export const persistedInvoiceDraftSchema = invoiceDraftFieldsSchema
  .readonly()
  .brand<"InvoiceDraft">();

export type InvoiceDraftInput = Readonly<z.input<typeof invoiceDraftFieldsSchema>>;
export type InvoiceDraft = Readonly<z.output<typeof persistedInvoiceDraftSchema>>;
type KeysOfUnion<Value> = Value extends Value ? keyof Value : never;
export type InvoiceDraftFieldName =
  | Exclude<KeysOfUnion<InvoiceDraftInput>, "exchange">
  | ExchangeDraftFieldName;
export type InvoiceDraftError = Readonly<{
  fieldName: InvoiceDraftFieldName;
  message: string;
}>;
export type InvoiceDraftWarning = Readonly<{
  kind: "late-issue-date";
  message: string;
}>;
const invoiceIssueInputSchema = z.strictObject({
  draft: invoiceDraftFieldsSchema,
  expectedInvoiceId: z.string(),
  lateIssueDateAcknowledged: z.boolean(),
});
export type InvoiceIssueInput = Readonly<z.output<typeof invoiceIssueInputSchema>>;

export const emptyInvoiceDraftInput: InvoiceDraftInput = {
  clientId: "",
  clientLegalName: "",
  clientPostalAddress: "",
  currencyCode: "GBP",
  serviceDescription: "",
  periodStart: "",
  periodEnd: "",
  issueDate: "",
  billableDays: "",
  dayRate: "",
  paymentTerms: "",
  notes: "",
  purchaseOrder: "",
  vatTreatment: "uk-taxable",
  vatRate: "",
  taxPoint: "",
  exchange: { kind: "not-required" },
};
export type { InvoiceTotals } from "./invoice-policy.ts";

type InvoiceCandidateFacts = Readonly<{
  client: Readonly<{ id: ClientId; legalName: string; postalAddress: string }>;
  currency: Client["currency"];
  serviceDescription: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  billableDays: string;
  dayRate: string;
  paymentTerms: string;
  notes: string;
  purchaseOrder: string;
  proposedInvoiceId: string;
  issuer: IssuerSettings;
  totals: InvoiceTotals;
}>;

export type InvoiceCandidate = InvoiceCandidateFacts & Readonly<{ taxFacts: InvoiceTaxFacts }>;

export type InvoiceDraftPreview = Readonly<{
  billableDays: string | null;
  clientLegalName: string | null;
  clientPostalAddress: string | null;
  currencyCode: string | null;
  formattedDayRate: string | null;
  issueDate: string | null;
  notes: string | null;
  paymentTerms: string | null;
  periodEnd: string | null;
  periodStart: string | null;
  proposedInvoiceId: string | null;
  purchaseOrder: string | null;
  serviceDescription: string | null;
  taxPoint: string | null;
  vatRate: string | null;
  vatWording: string;
}>;

export type InvoiceDraftReview = Readonly<{
  candidate: InvoiceCandidate | null;
  errors: readonly InvoiceDraftError[];
  formattedTotals: Readonly<{ net: string; vat: string; gross: string }> | null;
  preview: InvoiceDraftPreview;
  totals: InvoiceTotals | null;
  sterlingVatSummary: SterlingVatSummary | null;
  warnings: readonly InvoiceDraftWarning[];
}>;

type ReviewInvoiceDraftOptions = Readonly<{
  client: Client | undefined;
  draft: InvoiceDraftInput;
  issuer: IssuerSettings;
  today: BusinessDate;
}>;

export function createInvoiceDraft(client: Client): InvoiceDraftInput {
  const commonDraftFields = {
    clientId: client.id,
    clientLegalName: client.legalName,
    clientPostalAddress: client.postalAddress,
    currencyCode: client.currency.code,
    serviceDescription: client.defaultServiceDescription,
    periodStart: "",
    periodEnd: "",
    issueDate: "",
    billableDays: "",
    dayRate: client.standardDayRate,
    paymentTerms: client.paymentTerms,
    notes: "",
    purchaseOrder: "",
  };
  return client.vatTreatment.kind === "uk-taxable"
    ? {
        ...commonDraftFields,
        vatTreatment: "uk-taxable",
        vatRate: client.vatTreatment.rate,
        taxPoint: "",
        exchange: createExchangeDraft(client.currency.code),
      }
    : {
        ...commonDraftFields,
        vatTreatment: "outside-scope",
        outsideScopeEvidenceReference: client.vatTreatment.evidenceReference,
        reverseCharge: client.vatTreatment.reverseCharge,
      };
}

export function changeInvoiceDraftCurrency(
  draft: InvoiceDraftInput,
  currencyCode: string,
): InvoiceDraftInput {
  if (draft.vatTreatment === "outside-scope") return { ...draft, currencyCode };
  return {
    ...draft,
    currencyCode,
    exchange: createExchangeDraft(currencyCode),
  };
}

type UntrustedInvoiceDraftInput = Parameters<typeof invoiceDraftFieldsSchema.parse>[0];

export function parseInvoiceDraftInput(value: UntrustedInvoiceDraftInput): InvoiceDraftInput {
  return invoiceDraftFieldsSchema.parse(value);
}

type UntrustedInvoiceIssueInput = Parameters<typeof invoiceIssueInputSchema.parse>[0];

export function parseInvoiceIssueInput(value: UntrustedInvoiceIssueInput): InvoiceIssueInput {
  return invoiceIssueInputSchema.parse(value);
}

export function invoiceDraftInputsAreEqual(
  first: InvoiceDraftInput | null,
  second: InvoiceDraftInput,
): boolean {
  if (
    first === null ||
    first.vatTreatment !== second.vatTreatment ||
    !commonInvoiceDraftFieldNames.every((fieldName) => first[fieldName] === second[fieldName])
  ) {
    return false;
  }
  if (first.vatTreatment === "uk-taxable" && second.vatTreatment === "uk-taxable") {
    return (
      first.vatRate === second.vatRate &&
      first.taxPoint === second.taxPoint &&
      exchangeDraftInputsAreEqual(first.exchange, second.exchange)
    );
  }
  return (
    first.vatTreatment === "outside-scope" &&
    second.vatTreatment === "outside-scope" &&
    first.outsideScopeEvidenceReference === second.outsideScopeEvidenceReference &&
    first.reverseCharge === second.reverseCharge
  );
}

export function reviewInvoiceDraft({
  client,
  draft,
  issuer,
  today,
}: ReviewInvoiceDraftOptions): InvoiceDraftReview {
  const fields = normalizeDraftFields(draft);
  const currency = findCurrency(draft.currencyCode);
  const calculatedTotals = calculateTotals(
    currency,
    fields.billableDays,
    fields.dayRate,
    fields.tax,
  );
  const exchangeReview = reviewDraftExchange(draft, fields, currency, calculatedTotals);
  const errors = collectDraftErrors(client, draft, fields, currency, today, exchangeReview.errors);
  const totals = totalsHaveBlockingErrors(errors) ? null : calculatedTotals;
  const formattedTotals = formatTotals(currency, totals);
  const candidate =
    errors.length === 0 && client && currency && totals && exchangeReview.kind !== "invalid"
      ? createCandidate(client, fields, currency, issuer, totals, exchangeReview)
      : null;

  return {
    candidate,
    errors,
    formattedTotals,
    preview: createPreview(errors.length === 0 ? client : undefined, draft, fields, currency),
    totals,
    sterlingVatSummary: exchangeReview.sterlingVatSummary,
    warnings: lateIssueWarnings(fields.periodEnd, fields.issueDate),
  };
}

function reviewDraftExchange(
  draft: InvoiceDraftInput,
  fields: NormalizedDraftFields,
  currency: Currency | undefined,
  totals: InvoiceTotals | null,
): ExchangeReview {
  if (draft.vatTreatment === "outside-scope" || fields.tax.kind === "outside-scope") {
    return {
      errors: [],
      kind: "not-required",
      sterlingVatSummary: null,
    };
  }
  return reviewExchange({
    currencyCode: currency?.code,
    exchange: draft.exchange,
    taxPoint: fields.tax.taxPoint,
    totals,
    vatRate: fields.tax.rate,
  });
}

function totalsHaveBlockingErrors(errors: readonly InvoiceDraftError[]): boolean {
  const totalFields: readonly InvoiceDraftFieldName[] = [
    "billableDays",
    "currencyCode",
    "dayRate",
    "vatRate",
  ];
  return errors.some(({ fieldName }) => totalFields.includes(fieldName));
}

function createPreview(
  client: Client | undefined,
  draft: InvoiceDraftInput,
  fields: NormalizedDraftFields,
  currency: Currency | undefined,
): InvoiceDraftPreview {
  return {
    billableDays: normalizedFieldValue(fields.billableDays),
    clientLegalName: normalizedFieldValue(fields.clientLegalName),
    clientPostalAddress: normalizedFieldValue(fields.clientPostalAddress),
    currencyCode: currency?.code ?? null,
    formattedDayRate: formatDayRate(currency, fields.dayRate),
    issueDate: normalizedFieldValue(fields.issueDate),
    notes: normalizedFieldValue(fields.notes),
    paymentTerms: normalizedFieldValue(fields.paymentTerms),
    periodEnd: normalizedFieldValue(fields.periodEnd),
    periodStart: normalizedFieldValue(fields.periodStart),
    proposedInvoiceId: client
      ? formatDocumentId(client.invoiceSequence.prefix, client.invoiceSequence.nextNumber)
      : null,
    purchaseOrder: normalizedFieldValue(fields.purchaseOrder),
    serviceDescription: normalizedFieldValue(fields.serviceDescription),
    taxPoint: fields.tax.kind === "uk-taxable" ? normalizedFieldValue(fields.tax.taxPoint) : null,
    vatRate: fields.tax.kind === "uk-taxable" ? normalizedFieldValue(fields.tax.rate) : null,
    vatWording:
      draft.vatTreatment === "uk-taxable"
        ? ukTaxableWording
        : outsideScopeVatWording(draft.reverseCharge),
  };
}

function formatDayRate(currency: Currency | undefined, dayRate: NormalizedField): string | null {
  if (
    !currency ||
    dayRate.kind === "invalid" ||
    !amountFitsCurrencyPrecision(dayRate.value, currency.minorUnit)
  ) {
    return null;
  }
  return formatCurrencyAmount(dayRate.value, currency.code, currency.minorUnit);
}

function normalizedFieldValue(field: NormalizedField): string | null {
  return field.kind === "valid" ? field.value : null;
}

type NormalizedDraftFields = Readonly<{
  billableDays: NormalizedField;
  clientLegalName: NormalizedField;
  clientPostalAddress: NormalizedField;
  dayRate: NormalizedField;
  issueDate: NormalizedField;
  notes: NormalizedField;
  paymentTerms: NormalizedField;
  periodEnd: NormalizedField;
  periodStart: NormalizedField;
  purchaseOrder: NormalizedField;
  serviceDescription: NormalizedField;
  tax: NormalizedTaxFields;
}>;

type NormalizedTaxFields =
  | Readonly<{
      kind: "uk-taxable";
      rate: NormalizedField;
      taxPoint: NormalizedField;
    }>
  | Readonly<{
      evidenceReference: NormalizedField;
      kind: "outside-scope";
      reverseCharge: boolean;
    }>;

function normalizeDraftFields(draft: InvoiceDraftInput): NormalizedDraftFields {
  return {
    billableDays: normalizeBillableDays(draft.billableDays),
    clientLegalName: normalizeRequiredSingleLine(
      draft.clientLegalName,
      "Enter the client's legal name.",
    ),
    clientPostalAddress: normalizeRequiredMultiline(
      draft.clientPostalAddress,
      "Enter the client's postal address.",
    ),
    dayRate: normalizePositiveDecimal(draft.dayRate),
    issueDate: normalizeCalendarDate(draft.issueDate, "Enter the issue date."),
    notes: normalizeOptionalMultiline(draft.notes),
    paymentTerms: normalizeRequiredSingleLine(draft.paymentTerms, "Enter payment terms."),
    periodEnd: normalizeCalendarDate(draft.periodEnd, "Enter the period end."),
    periodStart: normalizeCalendarDate(draft.periodStart, "Enter the period start."),
    purchaseOrder: normalizeOptionalSingleLine(draft.purchaseOrder),
    serviceDescription: normalizeRequiredMultiline(
      draft.serviceDescription,
      "Enter the service description.",
    ),
    tax:
      draft.vatTreatment === "uk-taxable"
        ? {
            kind: "uk-taxable",
            rate: normalizeVatRate(draft.vatRate),
            taxPoint: normalizeCalendarDate(draft.taxPoint, "Enter the tax point."),
          }
        : {
            evidenceReference: normalizeRequiredMultiline(
              draft.outsideScopeEvidenceReference,
              "Enter an outside-scope evidence reference.",
            ),
            kind: "outside-scope",
            reverseCharge: draft.reverseCharge,
          },
  };
}

function collectDraftErrors(
  client: Client | undefined,
  draft: InvoiceDraftInput,
  fields: NormalizedDraftFields,
  currency: Currency | undefined,
  today: string,
  exchangeErrors: readonly InvoiceDraftError[],
): InvoiceDraftError[] {
  return [
    ...normalizedFieldErrors(fields),
    ...clientSelectionErrors(client, draft.clientId),
    ...currencySelectionErrors(currency),
    ...dateOrderErrors(fields.periodStart, fields.periodEnd, fields.issueDate, today),
    ...dayRatePrecisionErrors(currency, fields.dayRate),
    ...billablePeriodErrors(fields.periodStart, fields.periodEnd, fields.billableDays),
    ...taxTreatmentErrors(draft, fields),
    ...exchangeErrors,
  ];
}

function normalizedFieldErrors(fields: NormalizedDraftFields): InvoiceDraftError[] {
  const commonErrors = [
    ...fieldError("clientLegalName", fields.clientLegalName),
    ...fieldError("clientPostalAddress", fields.clientPostalAddress),
    ...fieldError("serviceDescription", fields.serviceDescription),
    ...fieldError("periodStart", fields.periodStart),
    ...fieldError("periodEnd", fields.periodEnd),
    ...fieldError("issueDate", fields.issueDate),
    ...fieldError("billableDays", fields.billableDays),
    ...fieldError("dayRate", fields.dayRate),
    ...fieldError("paymentTerms", fields.paymentTerms),
    ...fieldError("notes", fields.notes),
    ...fieldError("purchaseOrder", fields.purchaseOrder),
  ];
  return fields.tax.kind === "uk-taxable"
    ? [
        ...commonErrors,
        ...fieldError("taxPoint", fields.tax.taxPoint),
        ...fieldError("vatRate", fields.tax.rate),
      ]
    : [
        ...commonErrors,
        ...fieldError("outsideScopeEvidenceReference", fields.tax.evidenceReference),
      ];
}

function clientSelectionErrors(
  client: Client | undefined,
  clientId: string,
): readonly InvoiceDraftError[] {
  return client?.id === clientId
    ? []
    : [{ fieldName: "clientId", message: "Choose a saved client." }];
}

function currencySelectionErrors(currency: Currency | undefined): readonly InvoiceDraftError[] {
  return currency
    ? []
    : [{ fieldName: "currencyCode", message: "Choose a current ISO 4217 currency." }];
}

function dayRatePrecisionErrors(
  currency: Currency | undefined,
  dayRate: NormalizedField,
): readonly InvoiceDraftError[] {
  if (!currency || dayRate.kind === "invalid") return [];
  return !amountFitsCurrencyPrecision(dayRate.value, currency.minorUnit)
    ? [
        {
          fieldName: "dayRate",
          message: `Use no more than ${currency.minorUnit} decimal places for ${currency.code}.`,
        },
      ]
    : [];
}

function billablePeriodErrors(
  periodStart: NormalizedField,
  periodEnd: NormalizedField,
  billableDays: NormalizedField,
): readonly InvoiceDraftError[] {
  if (
    periodStart.kind === "invalid" ||
    periodEnd.kind === "invalid" ||
    billableDays.kind === "invalid"
  ) {
    return [];
  }
  const availableDays = inclusiveInvoicePeriodDays(periodStart.value, periodEnd.value);
  const dayLabel = availableDays === 1 ? "day" : "days";
  return billableDaysExceedInvoicePeriod(billableDays.value, periodStart.value, periodEnd.value)
    ? [
        {
          fieldName: "billableDays",
          message: `Billable days cannot exceed the ${availableDays} ${dayLabel} in the invoice period.`,
        },
      ]
    : [];
}

function formatTotals(
  currency: Currency | undefined,
  totals: InvoiceTotals | null,
): InvoiceDraftReview["formattedTotals"] {
  if (!currency || !totals) return null;
  return {
    net: formatCurrencyAmount(totals.net, currency.code, currency.minorUnit),
    vat: formatCurrencyAmount(totals.vat, currency.code, currency.minorUnit),
    gross: formatCurrencyAmount(totals.gross, currency.code, currency.minorUnit),
  };
}

function createCandidate(
  client: Client,
  fields: NormalizedDraftFields,
  currency: Currency,
  issuer: IssuerSettings,
  totals: InvoiceTotals,
  exchangeReview: Exclude<ExchangeReview, { kind: "invalid" }>,
): InvoiceCandidate {
  const facts: InvoiceCandidateFacts = {
    client: {
      id: client.id,
      legalName: validFieldValue(fields.clientLegalName),
      postalAddress: validFieldValue(fields.clientPostalAddress),
    },
    currency: persistedCurrencySchema.parse(currency),
    serviceDescription: validFieldValue(fields.serviceDescription),
    periodStart: validFieldValue(fields.periodStart),
    periodEnd: validFieldValue(fields.periodEnd),
    issueDate: validFieldValue(fields.issueDate),
    billableDays: validFieldValue(fields.billableDays),
    dayRate: validFieldValue(fields.dayRate),
    paymentTerms: validFieldValue(fields.paymentTerms),
    notes: validFieldValue(fields.notes),
    purchaseOrder: validFieldValue(fields.purchaseOrder),
    proposedInvoiceId: formatDocumentId(
      client.invoiceSequence.prefix,
      client.invoiceSequence.nextNumber,
    ),
    issuer,
    totals,
  };
  return {
    ...facts,
    taxFacts: createCandidateTaxFacts(fields.tax, exchangeReview),
  };
}

function createCandidateTaxFacts(
  fields: NormalizedTaxFields,
  exchangeReview: Exclude<ExchangeReview, { kind: "invalid" }>,
): InvoiceTaxFacts {
  const vatTreatment = createCandidateVatTreatment(fields);
  if (vatTreatment.kind === "outside-scope") {
    return persistedInvoiceTaxFactsSchema.parse({ kind: "outside-scope", vatTreatment });
  }
  if (exchangeReview.kind === "not-required") {
    return persistedInvoiceTaxFactsSchema.parse({ kind: "gbp-uk-vat", vatTreatment });
  }
  return persistedInvoiceTaxFactsSchema.parse({
    kind: "foreign-currency-uk-vat",
    sterlingVatSummary: exchangeReview.sterlingVatSummary,
    vatTreatment,
  });
}

function createCandidateVatTreatment(fields: NormalizedTaxFields): InvoiceVatTreatment {
  return persistedInvoiceVatTreatmentSchema.parse(
    fields.kind === "uk-taxable"
      ? {
          kind: "uk-taxable",
          rate: validFieldValue(fields.rate),
          taxPoint: validFieldValue(fields.taxPoint),
          wording: ukTaxableWording,
        }
      : {
          evidenceReference: validFieldValue(fields.evidenceReference),
          kind: "outside-scope",
          reverseCharge: fields.reverseCharge,
          wording: outsideScopeVatWording(fields.reverseCharge),
        },
  );
}

function validFieldValue(field: NormalizedField): string {
  if (field.kind === "invalid") {
    throw new Error("A validated invoice candidate contains an invalid field");
  }
  return field.value;
}

function fieldError(
  fieldName: InvoiceDraftFieldName,
  result: NormalizedField,
): readonly InvoiceDraftError[] {
  return result.kind === "invalid" ? [{ fieldName, message: result.message }] : [];
}

function normalizeCalendarDate(value: string, requiredMessage: string): NormalizedField {
  const normalized = value.normalize("NFC").trim();
  if (!normalized) return { kind: "invalid", message: requiredMessage };
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    return { kind: "invalid", message: "Enter a real calendar date." };
  }
  const timestamp = Date.parse(`${normalized}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== normalized
  ) {
    return { kind: "invalid", message: "Enter a real calendar date." };
  }
  return { kind: "valid", value: normalized };
}

function normalizeBillableDays(value: string): NormalizedField {
  const positiveDecimal = normalizePositiveDecimal(value);
  if (positiveDecimal.kind === "invalid") {
    return { kind: "invalid", message: "Enter positive billable days." };
  }
  if (!isPositiveQuarterDayAmount(positiveDecimal.value)) {
    return { kind: "invalid", message: "Use quarter-day increments." };
  }
  return positiveDecimal;
}

function dateOrderErrors(
  periodStart: NormalizedField,
  periodEnd: NormalizedField,
  issueDate: NormalizedField,
  todayValue: string,
): InvoiceDraftError[] {
  const today = normalizeCalendarDate(todayValue, "Enter today's date.");
  return [
    ...periodOrderErrors(periodStart, periodEnd),
    ...issuePeriodOrderErrors(periodEnd, issueDate),
    ...futureIssueDateErrors(issueDate, today),
  ];
}

function periodOrderErrors(
  periodStart: NormalizedField,
  periodEnd: NormalizedField,
): readonly InvoiceDraftError[] {
  return periodStart.kind === "valid" &&
    periodEnd.kind === "valid" &&
    periodStart.value > periodEnd.value
    ? [{ fieldName: "periodEnd", message: "The period end cannot precede its start." }]
    : [];
}

function issuePeriodOrderErrors(
  periodEnd: NormalizedField,
  issueDate: NormalizedField,
): readonly InvoiceDraftError[] {
  return periodEnd.kind === "valid" &&
    issueDate.kind === "valid" &&
    periodEnd.value > issueDate.value
    ? [{ fieldName: "issueDate", message: "The issue date cannot precede the period end." }]
    : [];
}

function futureIssueDateErrors(
  issueDate: NormalizedField,
  today: NormalizedField,
): readonly InvoiceDraftError[] {
  return issueDate.kind === "valid" && today.kind === "valid" && issueDate.value > today.value
    ? [{ fieldName: "issueDate", message: "The issue date cannot be in the future." }]
    : [];
}

function calculateTotals(
  currency: Currency | undefined,
  billableDays: NormalizedField,
  dayRate: NormalizedField,
  tax: NormalizedTaxFields,
): InvoiceTotals | null {
  const amounts = normalizedInvoiceAmounts(currency, billableDays, dayRate);
  if (!amounts) return null;
  const treatment = normalizedInvoiceTotalTreatment(tax);
  if (!treatment) return null;
  return calculateInvoiceTotals({
    billableDays: amounts.billableDays,
    dayRate: amounts.dayRate,
    minorUnit: amounts.currency.minorUnit,
    treatment,
  });
}

type NormalizedInvoiceAmounts = Readonly<{
  billableDays: string;
  currency: Currency;
  dayRate: string;
}>;

function normalizedInvoiceAmounts(
  currency: Currency | undefined,
  billableDays: NormalizedField,
  dayRate: NormalizedField,
): NormalizedInvoiceAmounts | null {
  if (!currency || billableDays.kind === "invalid" || dayRate.kind === "invalid") return null;
  if (!amountFitsCurrencyPrecision(dayRate.value, currency.minorUnit)) return null;
  return { billableDays: billableDays.value, currency, dayRate: dayRate.value };
}

function normalizedInvoiceTotalTreatment(tax: NormalizedTaxFields): InvoiceTotalTreatment | null {
  if (tax.kind === "outside-scope") return { kind: "outside-scope" };
  if (tax.rate.kind === "invalid") return null;
  return { kind: "uk-taxable", rate: tax.rate.value };
}

function taxTreatmentErrors(
  draft: InvoiceDraftInput,
  fields: NormalizedDraftFields,
): readonly InvoiceDraftError[] {
  if (draft.vatTreatment === "outside-scope" || fields.tax.kind === "outside-scope") return [];

  return taxPointOrderErrors(fields.periodEnd, fields.tax.taxPoint, fields.issueDate);
}

function taxPointOrderErrors(
  periodEnd: NormalizedField,
  taxPoint: NormalizedField,
  issueDate: NormalizedField,
): readonly InvoiceDraftError[] {
  if (periodEnd.kind === "invalid" || taxPoint.kind === "invalid") return [];
  if (taxPoint.value < periodEnd.value) {
    return [{ fieldName: "taxPoint", message: "The tax point cannot precede the period end." }];
  }
  return issueDate.kind === "valid" && taxPoint.value > issueDate.value
    ? [{ fieldName: "taxPoint", message: "The tax point cannot follow the issue date." }]
    : [];
}

function lateIssueWarnings(
  periodEnd: NormalizedField,
  issueDate: NormalizedField,
): readonly InvoiceDraftWarning[] {
  if (periodEnd.kind === "invalid" || issueDate.kind === "invalid") return [];
  return issueDateRequiresAcknowledgement(periodEnd.value, issueDate.value)
    ? [
        {
          kind: "late-issue-date",
          message:
            "The issue date is more than 14 days after the service period. Check the tax point before issue.",
        },
      ]
    : [];
}
