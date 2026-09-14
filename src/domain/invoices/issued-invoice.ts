import { z } from "zod";

import { clientIdSchema } from "../clients/client.ts";
import { persistedIssuerSettingsSchema } from "../issuer/issuer-settings.ts";
import { normalizePositiveDecimal } from "../money/decimal.ts";
import { normalizeVatRate } from "../tax/vat-rate.ts";
import {
  createFieldSchemas,
  normalizeOptionalMultiline,
  normalizeOptionalSingleLine,
  normalizeRequiredMultiline,
  normalizeRequiredSingleLine,
} from "../validation/text-field.ts";
import type { InvoiceCandidate } from "./invoice-draft.ts";
import { sterlingVatSummaryErrors } from "./exchange-record.ts";
import {
  amountFitsCurrencyPrecision,
  billableDaysExceedInvoicePeriod,
  calculateInvoiceTotals,
  isPositiveCanonicalDecimal,
  isPositiveQuarterDayAmount,
  issueDateRequiresAcknowledgement,
  type InvoiceTotalTreatment,
} from "./invoice-policy.ts";
import { persistedInvoiceTaxFactsSchema } from "./invoice-tax-facts.ts";

const invoiceIdSchema = z
  .string()
  .max(213)
  .regex(/^[A-Z0-9]{2,12}-\d{4,}$/u)
  .brand<"InvoiceId">();
const invoiceNumberSchema = z
  .string()
  .max(200)
  .regex(/^[1-9]\d*$/u);
const calendarDateSchema = z.iso.date();
const utcTimestampSchema = z.iso.datetime();
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
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const requiredSingleLineSchema = createFieldSchemas<"IssuedRequiredSingleLine">((value) =>
  normalizeRequiredSingleLine(value, "Enter a required invoice value."),
).persisted;
const optionalSingleLineSchema = createFieldSchemas<"IssuedOptionalSingleLine">(
  normalizeOptionalSingleLine,
).persisted;
const requiredMultilineSchema = createFieldSchemas<"IssuedRequiredMultiline">((value) =>
  normalizeRequiredMultiline(value, "Enter a required invoice value."),
).persisted;
const optionalMultilineSchema = createFieldSchemas<"IssuedOptionalMultiline">(
  normalizeOptionalMultiline,
).persisted;
const historicalCurrencySchema = z
  .strictObject({
    code: z.string().regex(/^[A-Z]{3}$/u),
    minorUnit: z.number().int().min(0).max(4),
    name: requiredSingleLineSchema,
  })
  .readonly();
const issuedInvoiceSnapshotFields = {
  id: invoiceIdSchema,
  invoiceNumber: invoiceNumberSchema,
  replacesInvoiceId: invoiceIdSchema.nullable().default(null),
  client: z
    .strictObject({
      id: clientIdSchema,
      legalName: requiredSingleLineSchema,
      postalAddress: requiredMultilineSchema,
    })
    .readonly(),
  currency: historicalCurrencySchema,
  serviceDescription: requiredMultilineSchema,
  periodStart: calendarDateSchema,
  periodEnd: calendarDateSchema,
  billableDays: positiveCanonicalDecimalSchema,
  dayRate: positiveCanonicalDecimalSchema,
  paymentTerms: requiredSingleLineSchema,
  notes: optionalMultilineSchema,
  purchaseOrder: optionalSingleLineSchema,
  issuer: persistedIssuerSettingsSchema,
  totals: z
    .strictObject({
      net: canonicalDecimalSchema,
      vat: canonicalDecimalSchema,
      gross: canonicalDecimalSchema,
    })
    .readonly(),
  taxFacts: persistedInvoiceTaxFactsSchema,
  issue: z
    .strictObject({
      date: calendarDateSchema,
      timestamp: utcTimestampSchema,
      businessTimezone: z.string().min(1),
      lateIssueDateAcknowledged: z.boolean(),
    })
    .readonly(),
} as const;

export const unrefinedIssuedInvoiceSnapshotSchema = z.strictObject(issuedInvoiceSnapshotFields);
type InvoiceFacts = z.output<typeof unrefinedIssuedInvoiceSnapshotSchema>;

const retainedInvoicePdfSchema = z
  .strictObject({
    filename: z.string().max(217),
    sha256: sha256Schema,
  })
  .readonly();

const persistedIssuedInvoiceSnapshotSchema = unrefinedIssuedInvoiceSnapshotSchema
  .superRefine(checkInvoiceFacts)
  .readonly()
  .brand<"IssuedInvoiceSnapshot">();

const unrefinedIssuedInvoiceSchema = unrefinedIssuedInvoiceSnapshotSchema.extend({
  retainedPdf: retainedInvoicePdfSchema,
});

export const persistedIssuedInvoiceSchema = unrefinedIssuedInvoiceSchema
  .superRefine((invoice, context) => {
    checkInvoiceFacts(invoice, context);
    checkRetainedPdfFilename(invoice, context);
  })
  .readonly()
  .brand<"IssuedInvoice">();

export const persistedIssuedInvoicesSchema = z
  .array(persistedIssuedInvoiceSchema)
  .superRefine(checkUniqueInvoiceIds)
  .readonly();

export type IssuedInvoiceSnapshot = Readonly<z.output<typeof persistedIssuedInvoiceSnapshotSchema>>;
export type IssuedInvoice = Readonly<z.output<typeof persistedIssuedInvoiceSchema>>;
export type InvoiceId = z.output<typeof invoiceIdSchema>;
export type RetainedInvoicePdf = IssuedInvoice["retainedPdf"];

type CreateIssuedInvoiceSnapshotOptions = Readonly<{
  candidate: InvoiceCandidate;
  invoiceNumber: string;
  issuedAt: string;
  lateIssueDateAcknowledged: boolean;
  replacesInvoiceId?: InvoiceId | null;
}>;

export function createIssuedInvoiceSnapshot({
  candidate,
  invoiceNumber,
  issuedAt,
  lateIssueDateAcknowledged,
  replacesInvoiceId = null,
}: CreateIssuedInvoiceSnapshotOptions): IssuedInvoiceSnapshot {
  return persistedIssuedInvoiceSnapshotSchema.parse({
    id: candidate.proposedInvoiceId,
    invoiceNumber,
    replacesInvoiceId,
    client: candidate.client,
    currency: candidate.currency,
    serviceDescription: candidate.serviceDescription,
    periodStart: candidate.periodStart,
    periodEnd: candidate.periodEnd,
    billableDays: candidate.billableDays,
    dayRate: candidate.dayRate,
    paymentTerms: candidate.paymentTerms,
    notes: candidate.notes,
    purchaseOrder: candidate.purchaseOrder,
    issuer: candidate.issuer,
    taxFacts: candidate.taxFacts,
    totals: candidate.totals,
    issue: {
      date: candidate.issueDate,
      timestamp: issuedAt,
      businessTimezone: candidate.issuer.businessTimezone,
      lateIssueDateAcknowledged,
    },
  });
}

type AttachRetainedInvoicePdfOptions = Readonly<{
  pdf: RetainedInvoicePdf;
  snapshot: IssuedInvoiceSnapshot;
}>;

export function attachRetainedInvoicePdf({
  pdf,
  snapshot,
}: AttachRetainedInvoicePdfOptions): IssuedInvoice {
  return persistedIssuedInvoiceSchema.parse({ ...snapshot, retainedPdf: pdf });
}

type UntrustedInvoiceId = Parameters<typeof invoiceIdSchema.parse>[0];

export function parseInvoiceId(value: UntrustedInvoiceId): InvoiceId {
  return invoiceIdSchema.parse(value);
}

type RefinementContext = z.core.$RefinementCtx;

function checkInvoiceFacts(invoice: InvoiceFacts, context: RefinementContext): void {
  checkCoreInvoiceFacts(invoice, context);
  checkSterlingVatSummary(invoice, context);
}

function checkCoreInvoiceFacts(invoice: InvoiceFacts, context: RefinementContext): void {
  checkInvoiceIdentity(invoice, context);
  checkInvoiceQuantityAndRate(invoice, context);
  checkInvoiceDates(invoice, context);
  checkInvoiceTotals(invoice, context);
  checkInvoiceTaxTreatment(invoice, context);
  checkInvoiceIssueEvent(invoice, context);
}

function checkRetainedPdfFilename(
  invoice: Readonly<{ id: string; retainedPdf: RetainedInvoicePdf }>,
  context: RefinementContext,
): void {
  if (invoice.retainedPdf.filename !== `${invoice.id}.pdf`) {
    context.addIssue({
      code: "custom",
      message: "The retained PDF filename must match the invoice ID.",
      path: ["retainedPdf", "filename"],
    });
  }
}

function checkUniqueInvoiceIds(
  invoices: readonly Readonly<{ id: string }>[],
  context: RefinementContext,
): void {
  const invoiceIds = new Set<string>();
  for (const [index, invoice] of invoices.entries()) {
    if (invoiceIds.has(invoice.id)) {
      context.addIssue({
        code: "custom",
        message: "Issued invoice IDs must be unique.",
        path: [index, "id"],
      });
    }
    invoiceIds.add(invoice.id);
  }
}

function checkInvoiceIdentity(invoice: InvoiceFacts, context: RefinementContext): void {
  if (!invoice.id.endsWith(`-${invoice.invoiceNumber.padStart(4, "0")}`)) {
    context.addIssue({
      code: "custom",
      message: "The invoice ID must contain its invoice number.",
      path: ["id"],
    });
  }
}

function checkInvoiceQuantityAndRate(invoice: InvoiceFacts, context: RefinementContext): void {
  if (!isPositiveQuarterDayAmount(invoice.billableDays)) {
    context.addIssue({
      code: "custom",
      message: "Billable days must be positive quarter-day increments.",
      path: ["billableDays"],
    });
  }
  if (!isPositiveCanonicalDecimal(invoice.dayRate)) {
    context.addIssue({
      code: "custom",
      message: "The day rate must be greater than zero.",
      path: ["dayRate"],
    });
  }
  if (!amountFitsCurrencyPrecision(invoice.dayRate, invoice.currency.minorUnit)) {
    context.addIssue({
      code: "custom",
      message: "The day rate exceeds the historical currency precision.",
      path: ["dayRate"],
    });
  }
}

function checkInvoiceDates(invoice: InvoiceFacts, context: RefinementContext): void {
  if (invoice.periodStart > invoice.periodEnd || invoice.periodEnd > invoice.issue.date) {
    context.addIssue({
      code: "custom",
      message: "The immutable invoice dates are out of order.",
      path: ["issue", "date"],
    });
  }
  if (
    isRealCalendarDate(invoice.periodStart) &&
    isRealCalendarDate(invoice.periodEnd) &&
    billableDaysExceedInvoicePeriod(invoice.billableDays, invoice.periodStart, invoice.periodEnd)
  ) {
    context.addIssue({
      code: "custom",
      message: "Billable days exceed the immutable service period.",
      path: ["billableDays"],
    });
  }
}

function checkInvoiceTotals(invoice: InvoiceFacts, context: RefinementContext): void {
  if (
    !isPositiveCanonicalDecimal(invoice.billableDays) ||
    !isPositiveCanonicalDecimal(invoice.dayRate)
  ) {
    return;
  }
  const treatment = invoiceTotalTreatment(invoice);
  if (!treatment) return;
  const expectedTotals = calculateInvoiceTotals({
    billableDays: invoice.billableDays,
    dayRate: invoice.dayRate,
    minorUnit: invoice.currency.minorUnit,
    treatment,
  });
  for (const totalName of ["net", "vat", "gross"] as const) {
    if (invoice.totals[totalName] !== expectedTotals[totalName]) {
      context.addIssue({
        code: "custom",
        message: `The immutable ${totalName} total does not match the invoice calculation.`,
        path: ["totals", totalName],
      });
    }
  }
}

function invoiceTotalTreatment(invoice: InvoiceFacts): InvoiceTotalTreatment | null {
  const vatTreatment = invoice.taxFacts.vatTreatment;
  if (vatTreatment.kind === "outside-scope") return { kind: "outside-scope" };
  const rate = normalizeVatRate(vatTreatment.rate);
  return rate.kind === "valid" && rate.value === vatTreatment.rate
    ? { kind: "uk-taxable", rate: rate.value }
    : null;
}

function checkInvoiceTaxTreatment(invoice: InvoiceFacts, context: RefinementContext): void {
  const { taxFacts } = invoice;
  if (taxFacts.kind === "outside-scope") return;
  if (
    taxFacts.kind === "gbp-uk-vat" &&
    (invoice.currency.code !== "GBP" || invoice.currency.minorUnit !== 2)
  ) {
    context.addIssue({
      code: "custom",
      message: "GBP VAT facts require GBP with two minor-unit digits.",
      path: ["currency"],
    });
  }
  if (taxFacts.kind === "foreign-currency-uk-vat" && invoice.currency.code === "GBP") {
    context.addIssue({
      code: "custom",
      message: "Foreign-currency VAT facts cannot use GBP.",
      path: ["currency"],
    });
  }
  if (
    taxFacts.vatTreatment.taxPoint < invoice.periodEnd ||
    taxFacts.vatTreatment.taxPoint > invoice.issue.date
  ) {
    context.addIssue({
      code: "custom",
      message: "The tax point must fall between the period end and issue date.",
      path: ["taxFacts", "vatTreatment", "taxPoint"],
    });
  }
}

function checkSterlingVatSummary(invoice: InvoiceFacts, context: RefinementContext): void {
  if (invoice.taxFacts.kind !== "foreign-currency-uk-vat") return;

  const errors = sterlingVatSummaryErrors({
    clientCurrencyNet: invoice.totals.net,
    summary: invoice.taxFacts.sterlingVatSummary,
    taxPoint: invoice.taxFacts.vatTreatment.taxPoint,
    vatRate: invoice.taxFacts.vatTreatment.rate,
  });
  for (const error of errors) {
    context.addIssue({
      code: "custom",
      message: error.message,
      path: ["taxFacts", "sterlingVatSummary", ...error.path],
    });
  }
}

function checkInvoiceIssueEvent(invoice: InvoiceFacts, context: RefinementContext): void {
  if (invoice.issue.businessTimezone !== invoice.issuer.businessTimezone) {
    context.addIssue({
      code: "custom",
      message: "The issue timezone must match the issuer snapshot.",
      path: ["issue", "businessTimezone"],
    });
  }
  if (
    isRealCalendarDate(invoice.periodEnd) &&
    isRealCalendarDate(invoice.issue.date) &&
    issueDateRequiresAcknowledgement(invoice.periodEnd, invoice.issue.date) &&
    !invoice.issue.lateIssueDateAcknowledged
  ) {
    context.addIssue({
      code: "custom",
      message: "A late issue date requires a tax-point acknowledgement.",
      path: ["issue", "lateIssueDateAcknowledged"],
    });
  }
}

function isRealCalendarDate(value: string): boolean {
  return calendarDateSchema.safeParse(value).success;
}
