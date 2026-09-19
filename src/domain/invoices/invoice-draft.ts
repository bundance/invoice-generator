import { z } from "zod";

import type { Client, ClientId } from "../clients/client.ts";
import { formatDocumentId } from "../clients/client.ts";
import { findCurrency, persistedCurrencySchema, type Currency } from "../money/currency.ts";
import { formatCurrencyAmount } from "../money/decimal.ts";
import type { IssuerSettings } from "../issuer/issuer-settings.ts";
import type { BusinessDate } from "../time/business-date.ts";
import {
  normalizeOptionalMultiline,
  normalizeOptionalSingleLine,
  normalizeRequiredMultiline,
  normalizeRequiredSingleLine,
  type NormalizedField,
} from "../validation/text-field.ts";
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
  outsideScopeInvoiceServiceLineInputSchema,
  normalizeInvoiceDate,
  reviewInvoiceServiceLines,
  taxableInvoiceServiceLineInputSchema,
  type InvoiceServiceLineFieldName,
  type InvoiceServiceLinePreview,
  type NonEmptyReadonlyArray,
  type OutsideScopeInvoiceServiceLineInput,
  type ReviewedInvoiceServiceLine,
  type ReviewedTaxableInvoiceServiceLine,
  type TaxableInvoiceServiceLineInput,
} from "./invoice-service-line.ts";
import { issueDateRequiresAcknowledgement, type InvoiceTotals } from "./invoice-policy.ts";
import {
  persistedInvoiceVatTreatmentSchema,
  type InvoiceVatTreatment,
} from "./invoice-vat-treatment.ts";
import { persistedInvoiceTaxFactsSchema, type InvoiceTaxFacts } from "./invoice-tax-facts.ts";

const taxableServiceLinesSchema = z
  .tuple([taxableInvoiceServiceLineInputSchema], taxableInvoiceServiceLineInputSchema)
  .readonly();
const outsideScopeServiceLinesSchema = z
  .tuple([outsideScopeInvoiceServiceLineInputSchema], outsideScopeInvoiceServiceLineInputSchema)
  .readonly();
const invoiceDraftFieldsSchema = z
  .discriminatedUnion("vatTreatment", [
    invoiceDraftCommonFieldsSchema.extend({
      exchange: exchangeDraftSchema,
      serviceLines: taxableServiceLinesSchema,
      vatTreatment: z.literal("uk-taxable"),
      taxPoint: z.string(),
    }),
    invoiceDraftCommonFieldsSchema.extend({
      serviceLines: outsideScopeServiceLinesSchema,
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
  | Exclude<KeysOfUnion<InvoiceDraftInput>, "exchange" | "serviceLines">
  | ExchangeDraftFieldName;
export type InvoiceDraftErrorLocation =
  | Readonly<{ kind: "invoice"; fieldName: InvoiceDraftFieldName }>
  | Readonly<{
      kind: "service-line";
      serviceLineIndex: number;
      fieldName: InvoiceServiceLineFieldName;
    }>;
export type InvoiceDraftError = Readonly<{
  location: InvoiceDraftErrorLocation;
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
  issueDate: "",
  paymentTerms: "",
  notes: "",
  purchaseOrder: "",
  serviceLines: [
    {
      billableDays: "",
      dayRate: "",
      periodEnd: "",
      periodStart: "",
      serviceDescription: "",
      vatRate: "",
    },
  ],
  vatTreatment: "uk-taxable",
  taxPoint: "",
  exchange: { kind: "not-required" },
};
export type { InvoiceTotals } from "./invoice-policy.ts";

type InvoiceCandidateFacts = Readonly<{
  client: Readonly<{ id: ClientId; legalName: string; postalAddress: string }>;
  currency: Client["currency"];
  issueDate: string;
  paymentTerms: string;
  notes: string;
  purchaseOrder: string;
  proposedInvoiceId: string;
  issuer: IssuerSettings;
  serviceLines: NonEmptyReadonlyArray<ReviewedInvoiceServiceLine>;
  totals: InvoiceTotals;
}>;

export type InvoiceCandidate = InvoiceCandidateFacts & Readonly<{ taxFacts: InvoiceTaxFacts }>;

export type InvoiceDraftPreview = Readonly<{
  clientLegalName: string | null;
  clientPostalAddress: string | null;
  currencyCode: string | null;
  issueDate: string | null;
  notes: string | null;
  paymentTerms: string | null;
  proposedInvoiceId: string | null;
  purchaseOrder: string | null;
  serviceLines: NonEmptyReadonlyArray<InvoiceServiceLinePreview>;
  taxPoint: string | null;
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

function createInvoiceServiceLineInput(
  client: Client,
): TaxableInvoiceServiceLineInput | OutsideScopeInvoiceServiceLineInput {
  const commonLine = {
    billableDays: "",
    dayRate: client.standardDayRate,
    periodEnd: "",
    periodStart: "",
    serviceDescription: client.defaultServiceDescription,
  };
  return client.vatTreatment.kind === "uk-taxable"
    ? { ...commonLine, vatRate: client.vatTreatment.rate }
    : commonLine;
}

export function createInvoiceDraft(client: Client): InvoiceDraftInput {
  const commonDraftFields = {
    clientId: client.id,
    clientLegalName: client.legalName,
    clientPostalAddress: client.postalAddress,
    currencyCode: client.currency.code,
    issueDate: "",
    paymentTerms: client.paymentTerms,
    notes: "",
    purchaseOrder: "",
  };
  if (client.vatTreatment.kind === "uk-taxable") {
    return {
      ...commonDraftFields,
      serviceLines: [
        { ...createInvoiceServiceLineInput(client), vatRate: client.vatTreatment.rate },
      ],
      vatTreatment: "uk-taxable",
      taxPoint: "",
      exchange: createExchangeDraft(client.currency.code),
    };
  }
  return {
    ...commonDraftFields,
    serviceLines: [createInvoiceServiceLineInput(client)],
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
  return { ...draft, currencyCode, exchange: createExchangeDraft(currencyCode) };
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
    !commonInvoiceDraftFieldNames.every((fieldName) => first[fieldName] === second[fieldName]) ||
    !serviceLineInputsAreEqual(first.serviceLines, second.serviceLines)
  ) {
    return false;
  }
  if (first.vatTreatment === "uk-taxable" && second.vatTreatment === "uk-taxable") {
    return (
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
  const fields = normalizeInvoiceFields(draft);
  const currency = findCurrency(draft.currencyCode);
  const serviceLineReview =
    draft.vatTreatment === "uk-taxable"
      ? reviewInvoiceServiceLines({
          currency,
          kind: "uk-taxable",
          serviceLines: draft.serviceLines,
        })
      : reviewInvoiceServiceLines({
          currency,
          kind: "outside-scope",
          serviceLines: draft.serviceLines,
        });
  const exchangeReview = reviewDraftExchange(
    draft,
    fields,
    currency,
    serviceLineReview.serviceLines,
  );
  const errors = collectDraftErrors(
    client,
    draft,
    fields,
    currency,
    today,
    serviceLineReview,
    exchangeReview.errors,
  );
  const candidate =
    errors.length === 0 &&
    client &&
    currency &&
    serviceLineReview.serviceLines &&
    serviceLineReview.totals &&
    exchangeReview.kind !== "invalid"
      ? createCandidate(
          client,
          fields,
          currency,
          issuer,
          serviceLineReview.serviceLines,
          serviceLineReview.totals,
          exchangeReview,
        )
      : null;

  return {
    candidate,
    errors,
    formattedTotals: formatTotals(currency, serviceLineReview.totals),
    preview: createPreview(
      errors.length === 0 ? client : undefined,
      draft,
      fields,
      currency,
      serviceLineReview.previews,
    ),
    totals: serviceLineReview.totals,
    sterlingVatSummary: exchangeReview.sterlingVatSummary,
    warnings: lateIssueWarnings(serviceLineReview.latestPeriodEnd, fields.issueDate),
  };
}

function reviewDraftExchange(
  draft: InvoiceDraftInput,
  fields: NormalizedInvoiceFields,
  currency: Currency | undefined,
  serviceLines: NonEmptyReadonlyArray<ReviewedInvoiceServiceLine> | null,
): ExchangeReview {
  if (draft.vatTreatment === "outside-scope" || fields.tax.kind === "outside-scope") {
    return { errors: [], kind: "not-required", sterlingVatSummary: null };
  }
  return reviewExchange({
    currency,
    exchange: draft.exchange,
    serviceLines: taxableServiceLines(serviceLines),
    taxPoint: fields.tax.taxPoint,
  });
}

function taxableServiceLines(
  serviceLines: NonEmptyReadonlyArray<ReviewedInvoiceServiceLine> | null,
): NonEmptyReadonlyArray<ReviewedTaxableInvoiceServiceLine> | null {
  if (!serviceLines || !serviceLines.every(isTaxableServiceLine)) return null;
  const [first, ...rest] = serviceLines;
  if (!isTaxableServiceLine(first)) return null;
  return [first, ...rest.filter(isTaxableServiceLine)];
}

function isTaxableServiceLine(
  serviceLine: ReviewedInvoiceServiceLine,
): serviceLine is ReviewedTaxableInvoiceServiceLine {
  return "vatRate" in serviceLine;
}

function createPreview(
  client: Client | undefined,
  draft: InvoiceDraftInput,
  fields: NormalizedInvoiceFields,
  currency: Currency | undefined,
  serviceLines: NonEmptyReadonlyArray<InvoiceServiceLinePreview>,
): InvoiceDraftPreview {
  return {
    clientLegalName: normalizedFieldValue(fields.clientLegalName),
    clientPostalAddress: normalizedFieldValue(fields.clientPostalAddress),
    currencyCode: currency?.code ?? null,
    issueDate: normalizedFieldValue(fields.issueDate),
    notes: normalizedFieldValue(fields.notes),
    paymentTerms: normalizedFieldValue(fields.paymentTerms),
    proposedInvoiceId: client
      ? formatDocumentId(client.invoiceSequence.prefix, client.invoiceSequence.nextNumber)
      : null,
    purchaseOrder: normalizedFieldValue(fields.purchaseOrder),
    serviceLines,
    taxPoint: fields.tax.kind === "uk-taxable" ? normalizedFieldValue(fields.tax.taxPoint) : null,
    vatWording:
      draft.vatTreatment === "uk-taxable"
        ? ukTaxableWording
        : outsideScopeVatWording(draft.reverseCharge),
  };
}

type NormalizedInvoiceFields = Readonly<{
  clientLegalName: NormalizedField;
  clientPostalAddress: NormalizedField;
  issueDate: NormalizedField;
  notes: NormalizedField;
  paymentTerms: NormalizedField;
  purchaseOrder: NormalizedField;
  tax:
    | Readonly<{ kind: "uk-taxable"; taxPoint: NormalizedField }>
    | Readonly<{
        evidenceReference: NormalizedField;
        kind: "outside-scope";
        reverseCharge: boolean;
      }>;
}>;

function normalizeInvoiceFields(draft: InvoiceDraftInput): NormalizedInvoiceFields {
  return {
    clientLegalName: normalizeRequiredSingleLine(
      draft.clientLegalName,
      "Enter the client's legal name.",
    ),
    clientPostalAddress: normalizeRequiredMultiline(
      draft.clientPostalAddress,
      "Enter the client's postal address.",
    ),
    issueDate: normalizeInvoiceDate(draft.issueDate, "Enter the issue date."),
    notes: normalizeOptionalMultiline(draft.notes),
    paymentTerms: normalizeRequiredSingleLine(draft.paymentTerms, "Enter payment terms."),
    purchaseOrder: normalizeOptionalSingleLine(draft.purchaseOrder),
    tax:
      draft.vatTreatment === "uk-taxable"
        ? {
            kind: "uk-taxable",
            taxPoint: normalizeInvoiceDate(draft.taxPoint, "Enter the tax point."),
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
  fields: NormalizedInvoiceFields,
  currency: Currency | undefined,
  today: string,
  serviceLineReview: ReturnType<typeof reviewInvoiceServiceLines>,
  exchangeErrors: ExchangeReview["errors"],
): InvoiceDraftError[] {
  return [
    ...normalizedInvoiceFieldErrors(fields),
    ...serviceLineReview.errors.map(({ fieldName, message, serviceLineIndex }) => ({
      location: { fieldName, kind: "service-line" as const, serviceLineIndex },
      message,
    })),
    ...clientSelectionErrors(client, draft.clientId),
    ...currencySelectionErrors(currency),
    ...dateOrderErrors(serviceLineReview.latestPeriodEnd, fields.issueDate, today),
    ...taxTreatmentErrors(fields, serviceLineReview.latestPeriodEnd),
    ...exchangeErrors.map(({ fieldName, message }) => invoiceFieldError(fieldName, message)),
  ];
}

function normalizedInvoiceFieldErrors(fields: NormalizedInvoiceFields): InvoiceDraftError[] {
  const commonErrors = [
    ...fieldErrors("clientLegalName", fields.clientLegalName),
    ...fieldErrors("clientPostalAddress", fields.clientPostalAddress),
    ...fieldErrors("issueDate", fields.issueDate),
    ...fieldErrors("paymentTerms", fields.paymentTerms),
    ...fieldErrors("notes", fields.notes),
    ...fieldErrors("purchaseOrder", fields.purchaseOrder),
  ];
  return fields.tax.kind === "uk-taxable"
    ? [...commonErrors, ...fieldErrors("taxPoint", fields.tax.taxPoint)]
    : [
        ...commonErrors,
        ...fieldErrors("outsideScopeEvidenceReference", fields.tax.evidenceReference),
      ];
}

function clientSelectionErrors(
  client: Client | undefined,
  clientId: string,
): readonly InvoiceDraftError[] {
  return client?.id === clientId ? [] : [invoiceFieldError("clientId", "Choose a saved client.")];
}

function currencySelectionErrors(currency: Currency | undefined): readonly InvoiceDraftError[] {
  return currency ? [] : [invoiceFieldError("currencyCode", "Choose a current ISO 4217 currency.")];
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
  fields: NormalizedInvoiceFields,
  currency: Currency,
  issuer: IssuerSettings,
  serviceLines: NonEmptyReadonlyArray<ReviewedInvoiceServiceLine>,
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
    issueDate: validFieldValue(fields.issueDate),
    paymentTerms: validFieldValue(fields.paymentTerms),
    notes: validFieldValue(fields.notes),
    purchaseOrder: validFieldValue(fields.purchaseOrder),
    proposedInvoiceId: formatDocumentId(
      client.invoiceSequence.prefix,
      client.invoiceSequence.nextNumber,
    ),
    issuer,
    serviceLines,
    totals,
  };
  return { ...facts, taxFacts: createCandidateTaxFacts(fields.tax, exchangeReview) };
}

function createCandidateTaxFacts(
  tax: NormalizedInvoiceFields["tax"],
  exchangeReview: Exclude<ExchangeReview, { kind: "invalid" }>,
): InvoiceTaxFacts {
  const vatTreatment = createCandidateVatTreatment(tax);
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

function createCandidateVatTreatment(tax: NormalizedInvoiceFields["tax"]): InvoiceVatTreatment {
  return persistedInvoiceVatTreatmentSchema.parse(
    tax.kind === "uk-taxable"
      ? {
          kind: "uk-taxable",
          taxPoint: validFieldValue(tax.taxPoint),
          wording: ukTaxableWording,
        }
      : {
          evidenceReference: validFieldValue(tax.evidenceReference),
          kind: "outside-scope",
          reverseCharge: tax.reverseCharge,
          wording: outsideScopeVatWording(tax.reverseCharge),
        },
  );
}

function serviceLineInputsAreEqual(
  first: InvoiceDraftInput["serviceLines"],
  second: InvoiceDraftInput["serviceLines"],
): boolean {
  if (first.length !== second.length) return false;
  return first.every((serviceLine, index) => serviceLineInputsMatch(serviceLine, second[index]));
}

function serviceLineInputsMatch(
  first: InvoiceDraftInput["serviceLines"][number],
  second: InvoiceDraftInput["serviceLines"][number] | undefined,
): boolean {
  if (!second) return false;
  const commonFields = [
    "billableDays",
    "dayRate",
    "periodEnd",
    "periodStart",
    "serviceDescription",
  ] as const;
  if (!commonFields.every((fieldName) => first[fieldName] === second[fieldName])) return false;
  if (!("vatRate" in first)) return !("vatRate" in second);
  return "vatRate" in second && first.vatRate === second.vatRate;
}

function fieldErrors(
  fieldName: InvoiceDraftFieldName,
  field: NormalizedField,
): readonly InvoiceDraftError[] {
  return field.kind === "invalid" ? [invoiceFieldError(fieldName, field.message)] : [];
}

function invoiceFieldError(fieldName: InvoiceDraftFieldName, message: string): InvoiceDraftError {
  return { location: { fieldName, kind: "invoice" }, message };
}

function dateOrderErrors(
  latestPeriodEnd: string | null,
  issueDate: NormalizedField,
  todayValue: string,
): InvoiceDraftError[] {
  const today = normalizeInvoiceDate(todayValue, "Enter today's date.");
  return [
    ...issuePeriodOrderErrors(latestPeriodEnd, issueDate),
    ...futureIssueDateErrors(issueDate, today),
  ];
}

function issuePeriodOrderErrors(
  latestPeriodEnd: string | null,
  issueDate: NormalizedField,
): readonly InvoiceDraftError[] {
  return latestPeriodEnd && issueDate.kind === "valid" && latestPeriodEnd > issueDate.value
    ? [invoiceFieldError("issueDate", "The issue date cannot precede the latest period end.")]
    : [];
}

function futureIssueDateErrors(
  issueDate: NormalizedField,
  today: NormalizedField,
): readonly InvoiceDraftError[] {
  return issueDate.kind === "valid" && today.kind === "valid" && issueDate.value > today.value
    ? [invoiceFieldError("issueDate", "The issue date cannot be in the future.")]
    : [];
}

function taxTreatmentErrors(
  fields: NormalizedInvoiceFields,
  latestPeriodEnd: string | null,
): readonly InvoiceDraftError[] {
  if (fields.tax.kind === "outside-scope") return [];
  return taxPointOrderErrors(latestPeriodEnd, fields.tax.taxPoint, fields.issueDate);
}

function taxPointOrderErrors(
  latestPeriodEnd: string | null,
  taxPoint: NormalizedField,
  issueDate: NormalizedField,
): readonly InvoiceDraftError[] {
  if (!latestPeriodEnd || taxPoint.kind === "invalid") return [];
  if (taxPoint.value < latestPeriodEnd) {
    return [invoiceFieldError("taxPoint", "The tax point cannot precede the latest period end.")];
  }
  return issueDate.kind === "valid" && taxPoint.value > issueDate.value
    ? [invoiceFieldError("taxPoint", "The tax point cannot follow the issue date.")]
    : [];
}

function lateIssueWarnings(
  latestPeriodEnd: string | null,
  issueDate: NormalizedField,
): readonly InvoiceDraftWarning[] {
  if (!latestPeriodEnd || issueDate.kind === "invalid") return [];
  return issueDateRequiresAcknowledgement(latestPeriodEnd, issueDate.value)
    ? [
        {
          kind: "late-issue-date",
          message:
            "The issue date is more than 14 days after the latest service period. Check the tax point before issue.",
        },
      ]
    : [];
}

function normalizedFieldValue(field: NormalizedField): string | null {
  return field.kind === "valid" ? field.value : null;
}

function validFieldValue(field: NormalizedField): string {
  if (field.kind === "invalid") {
    throw new Error("A validated invoice candidate contains an invalid field");
  }
  return field.value;
}
