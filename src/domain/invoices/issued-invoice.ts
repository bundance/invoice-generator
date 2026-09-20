import { z } from "zod";

import { clientIdSchema } from "../clients/client.ts";
import { persistedIssuerSettingsSchema } from "../issuer/issuer-settings.ts";
import { addDecimalAmounts } from "../money/decimal.ts";
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
  isPositiveQuarterDayAmount,
  issueDateRequiresAcknowledgement,
} from "./invoice-policy.ts";
import {
  persistedInvoiceServiceLineSchema,
  type NonEmptyReadonlyArray,
  type ReviewedTaxableInvoiceServiceLine,
} from "./invoice-service-line.ts";
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
  serviceLines: z.array(persistedInvoiceServiceLineSchema).min(1).readonly(),
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
    serviceLines: candidate.serviceLines,
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
  checkInvoiceServiceLines(invoice, context);
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

function checkInvoiceServiceLines(invoice: InvoiceFacts, context: RefinementContext): void {
  for (const [index, serviceLine] of invoice.serviceLines.entries()) {
    checkInvoiceServiceLine(invoice, serviceLine, index, context);
  }
}

function checkInvoiceServiceLine(
  invoice: InvoiceFacts,
  serviceLine: InvoiceFacts["serviceLines"][number],
  index: number,
  context: RefinementContext,
): void {
  if (!isPositiveQuarterDayAmount(serviceLine.billableDays)) {
    addLineIssue(
      context,
      index,
      "billableDays",
      "Billable days must be positive quarter-day increments.",
    );
  }
  if (!amountFitsCurrencyPrecision(serviceLine.dayRate, invoice.currency.minorUnit)) {
    addLineIssue(
      context,
      index,
      "dayRate",
      "The day rate exceeds the historical currency precision.",
    );
  }
  const datesAreOutOfOrder =
    serviceLine.periodStart > serviceLine.periodEnd || serviceLine.periodEnd > invoice.issue.date;
  if (datesAreOutOfOrder) {
    addLineIssue(context, index, "periodEnd", "The immutable service-line dates are out of order.");
  }
  if (
    billableDaysExceedInvoicePeriod(
      serviceLine.billableDays,
      serviceLine.periodStart,
      serviceLine.periodEnd,
    )
  ) {
    addLineIssue(
      context,
      index,
      "billableDays",
      "Billable days exceed the immutable service period.",
    );
  }
  checkInvoiceServiceLineTotals(invoice, serviceLine, index, context);
}

function checkInvoiceServiceLineTotals(
  invoice: InvoiceFacts,
  serviceLine: InvoiceFacts["serviceLines"][number],
  index: number,
  context: RefinementContext,
): void {
  const expectedTotals = calculateInvoiceTotals({
    billableDays: serviceLine.billableDays,
    dayRate: serviceLine.dayRate,
    minorUnit: invoice.currency.minorUnit,
    treatment:
      "vatRate" in serviceLine
        ? { kind: "uk-taxable", rate: serviceLine.vatRate }
        : { kind: "outside-scope" },
  });
  for (const totalName of ["net", "vat", "gross"] as const) {
    if (serviceLine.totals[totalName] === expectedTotals[totalName]) continue;
    addLineIssue(
      context,
      index,
      "totals",
      `The immutable ${totalName} total does not match the service-line calculation.`,
    );
  }
}

function checkInvoiceTotals(invoice: InvoiceFacts, context: RefinementContext): void {
  const zero =
    invoice.currency.minorUnit === 0 ? "0" : `0.${"0".repeat(invoice.currency.minorUnit)}`;
  const expectedTotals = invoice.serviceLines.reduce(
    (totals, serviceLine) => ({
      gross: addDecimalAmounts(totals.gross, serviceLine.totals.gross, invoice.currency.minorUnit),
      net: addDecimalAmounts(totals.net, serviceLine.totals.net, invoice.currency.minorUnit),
      vat: addDecimalAmounts(totals.vat, serviceLine.totals.vat, invoice.currency.minorUnit),
    }),
    { gross: zero, net: zero, vat: zero },
  );
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

function checkInvoiceTaxTreatment(invoice: InvoiceFacts, context: RefinementContext): void {
  const { taxFacts } = invoice;
  const taxableLines = invoice.serviceLines.filter(isTaxableServiceLine);
  if (taxFacts.kind === "outside-scope") {
    if (taxableLines.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Outside-scope invoice lines cannot carry VAT rates.",
        path: ["serviceLines"],
      });
    }
    return;
  }
  if (taxableLines.length !== invoice.serviceLines.length) {
    context.addIssue({
      code: "custom",
      message: "UK-taxable invoice lines must each carry a VAT rate.",
      path: ["serviceLines"],
    });
  }
  checkInvoiceVatCurrency(invoice, context);
  if (
    taxFacts.vatTreatment.taxPoint < latestPeriodEnd(invoice) ||
    taxFacts.vatTreatment.taxPoint > invoice.issue.date
  ) {
    context.addIssue({
      code: "custom",
      message: "The tax point must fall between the period end and issue date.",
      path: ["taxFacts", "vatTreatment", "taxPoint"],
    });
  }
}

function checkInvoiceVatCurrency(invoice: InvoiceFacts, context: RefinementContext): void {
  const { taxFacts } = invoice;
  const invalidGbpFacts =
    taxFacts.kind === "gbp-uk-vat" &&
    (invoice.currency.code !== "GBP" || invoice.currency.minorUnit !== 2);
  const invalidForeignFacts =
    taxFacts.kind === "foreign-currency-uk-vat" && invoice.currency.code === "GBP";
  if (!invalidGbpFacts && !invalidForeignFacts) return;
  context.addIssue({
    code: "custom",
    message: invalidGbpFacts
      ? "GBP VAT facts require GBP with two minor-unit digits."
      : "Foreign-currency VAT facts cannot use GBP.",
    path: ["currency"],
  });
}

function checkSterlingVatSummary(invoice: InvoiceFacts, context: RefinementContext): void {
  if (invoice.taxFacts.kind !== "foreign-currency-uk-vat") return;

  const serviceLines = asTaxableNonEmpty(invoice.serviceLines);
  if (!serviceLines) return;

  const errors = sterlingVatSummaryErrors({
    clientCurrencyMinorUnit: invoice.currency.minorUnit,
    serviceLines,
    summary: invoice.taxFacts.sterlingVatSummary,
    taxPoint: invoice.taxFacts.vatTreatment.taxPoint,
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
    isRealCalendarDate(latestPeriodEnd(invoice)) &&
    isRealCalendarDate(invoice.issue.date) &&
    issueDateRequiresAcknowledgement(latestPeriodEnd(invoice), invoice.issue.date) &&
    !invoice.issue.lateIssueDateAcknowledged
  ) {
    context.addIssue({
      code: "custom",
      message: "A late issue date requires a tax-point acknowledgement.",
      path: ["issue", "lateIssueDateAcknowledged"],
    });
  }
}

function latestPeriodEnd(invoice: InvoiceFacts): string {
  return invoice.serviceLines.reduce(
    (latest, line) => (line.periodEnd > latest ? line.periodEnd : latest),
    invoice.serviceLines[0]?.periodEnd ?? "",
  );
}

function isTaxableServiceLine(
  serviceLine: InvoiceFacts["serviceLines"][number],
): serviceLine is Extract<InvoiceFacts["serviceLines"][number], { vatRate: string }> {
  return "vatRate" in serviceLine;
}

function asTaxableNonEmpty(
  serviceLines: InvoiceFacts["serviceLines"],
): NonEmptyReadonlyArray<ReviewedTaxableInvoiceServiceLine> | null {
  if (!serviceLines.every(isTaxableServiceLine)) return null;
  const [first, ...rest] = serviceLines;
  return first ? [{ ...first }, ...rest.map((serviceLine) => ({ ...serviceLine }))] : null;
}

function addLineIssue(
  context: RefinementContext,
  index: number,
  field: string,
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: ["serviceLines", index, field] });
}

function isRealCalendarDate(value: string): boolean {
  return calendarDateSchema.safeParse(value).success;
}
