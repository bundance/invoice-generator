import type {
  CreditNote,
  CreditNoteSnapshot,
  CreditNoteTaxFacts,
  FullCreditNoteCandidate,
} from "../domain/invoices/credit-note.ts";
import type { InvoiceCandidate, InvoiceDraftReview } from "../domain/invoices/invoice-draft.ts";
import type { InvoiceTaxFacts } from "../domain/invoices/invoice-tax-facts.ts";
import type { IssuedInvoice, IssuedInvoiceSnapshot } from "../domain/invoices/issued-invoice.ts";
import type { IssuerSettings } from "../domain/issuer/issuer-settings.ts";
import { formatCurrencyAmount } from "../domain/money/decimal.ts";
import { formatSterlingVatSummary, type SterlingVatDetails } from "./exchange-presentation.ts";

type BillingDocumentServiceLine = Readonly<{
  renderKey: string;
  serviceDescription: string;
  periodStart: string;
  periodEnd: string;
  billableDays: string;
  dayRate: string;
  vatRate: string | null;
  net: string;
  vat: string;
  gross: string;
}>;

type SharedBillingDocumentModel = Readonly<{
  id: string;
  issuer: IssuerSettings;
  clientLegalName: string;
  clientPostalAddress: string;
  serviceLines: readonly BillingDocumentServiceLine[];
  sterlingVatSummary: SterlingVatDetails | null;
  taxPoint: string | null;
  issueDate: string;
  net: string;
  vat: string;
  gross: string;
  currencyCode: string;
  paymentTerms: string;
  notes: readonly string[];
  vatWording: string;
}>;

export type BillingDocumentModel =
  | Readonly<SharedBillingDocumentModel & { kind: "draft-invoice" }>
  | Readonly<SharedBillingDocumentModel & { kind: "issued-invoice" }>
  | Readonly<
      SharedBillingDocumentModel & {
        kind: "credit-note";
        originalInvoiceId: string;
        originalIssueDate: string;
        reason: string;
      }
    >;

export function createIssuedInvoiceDocumentModel(
  invoice: IssuedInvoice | IssuedInvoiceSnapshot,
): Extract<BillingDocumentModel, { kind: "issued-invoice" }> {
  return {
    ...createFinalBillingDocumentModel({ ...invoice, issueDate: invoice.issue.date }),
    kind: "issued-invoice",
  };
}

export function createCreditNoteDocumentModel(
  creditNote: CreditNote | CreditNoteSnapshot | FullCreditNoteCandidate,
): Extract<BillingDocumentModel, { kind: "credit-note" }> {
  const issueDate = "issueDate" in creditNote ? creditNote.issueDate : creditNote.issue.date;
  return {
    ...createFinalBillingDocumentModel({ ...creditNote, issueDate }),
    kind: "credit-note",
    originalInvoiceId: creditNote.originalInvoiceId,
    originalIssueDate: creditNote.originalIssueDate,
    reason: creditNote.reason,
  };
}

export function createCandidateInvoiceDocumentModel(
  candidate: InvoiceCandidate,
): Extract<BillingDocumentModel, { kind: "issued-invoice" }> {
  return { ...createFinalBillingDocumentModel(candidate), kind: "issued-invoice" };
}

type FinalBillingDocumentFacts = Readonly<{
  client: Readonly<{ legalName: string; postalAddress: string }>;
  currency: Readonly<{ code: string; minorUnit: number }>;
  id?: string;
  issuer: IssuerSettings;
  issueDate: string;
  notes: string;
  paymentTerms: string;
  proposedInvoiceId?: string;
  purchaseOrder: string;
  serviceLines: readonly Readonly<{
    billableDays: string;
    dayRate: string;
    periodEnd: string;
    periodStart: string;
    serviceDescription: string;
    totals: Readonly<{ gross: string; net: string; vat: string }>;
    vatRate?: string;
  }>[];
  taxFacts: CreditNoteTaxFacts | InvoiceTaxFacts;
  totals: Readonly<{ gross: string; net: string; vat: string }>;
}>;

function createFinalBillingDocumentModel(
  document: FinalBillingDocumentFacts,
): SharedBillingDocumentModel {
  const formatAmount = (amount: string) =>
    formatCurrencyAmount(amount, document.currency.code, document.currency.minorUnit);
  const taxPresentation = createTaxPresentation(document.taxFacts, document.currency.code);
  return {
    id: resolveFinalDocumentId(document),
    issuer: document.issuer,
    clientLegalName: document.client.legalName,
    clientPostalAddress: document.client.postalAddress,
    serviceLines: document.serviceLines.map((serviceLine, index) => ({
      renderKey: `${serviceLine.serviceDescription}-${serviceLine.periodStart}-${serviceLine.periodEnd}-${index + 1}`,
      billableDays: serviceLine.billableDays,
      dayRate: formatAmount(serviceLine.dayRate),
      gross: formatAmount(serviceLine.totals.gross),
      net: formatAmount(serviceLine.totals.net),
      periodEnd: serviceLine.periodEnd,
      periodStart: serviceLine.periodStart,
      serviceDescription: serviceLine.serviceDescription,
      vat: formatAmount(serviceLine.totals.vat),
      vatRate: serviceLine.vatRate ?? null,
    })),
    sterlingVatSummary: taxPresentation.sterlingVatSummary,
    taxPoint: taxPresentation.taxPoint,
    issueDate: document.issueDate,
    net: formatAmount(document.totals.net),
    vat: formatAmount(document.totals.vat),
    gross: formatAmount(document.totals.gross),
    currencyCode: document.currency.code,
    paymentTerms: document.paymentTerms,
    notes: documentNotes(document.purchaseOrder, document.notes),
    vatWording: taxPresentation.vatWording,
  };
}

type TaxPresentation = Readonly<{
  sterlingVatSummary: SterlingVatDetails | null;
  taxPoint: string | null;
  vatWording: string;
}>;

function createTaxPresentation(
  taxFacts: CreditNoteTaxFacts | InvoiceTaxFacts,
  currencyCode: string,
): TaxPresentation {
  const sterlingVatSummary =
    taxFacts.kind === "foreign-currency-uk-vat" ? taxFacts.sterlingVatSummary : null;
  const ukTaxTreatment = taxFacts.vatTreatment.kind === "uk-taxable" ? taxFacts.vatTreatment : null;
  return {
    sterlingVatSummary: formatSterlingVatSummary(sterlingVatSummary, currencyCode),
    taxPoint: ukTaxTreatment?.taxPoint ?? null,
    vatWording: taxFacts.vatTreatment.wording,
  };
}

function resolveFinalDocumentId(document: FinalBillingDocumentFacts): string {
  return document.id ?? document.proposedInvoiceId ?? "Unnumbered draft";
}

export function createDraftInvoiceDocumentModel(
  issuer: IssuerSettings,
  review: InvoiceDraftReview,
): Extract<BillingDocumentModel, { kind: "draft-invoice" }> {
  const preview = review.preview;
  return {
    kind: "draft-invoice",
    id: displayValue(preview.proposedInvoiceId, "Unnumbered draft"),
    issuer,
    clientLegalName: displayValue(preview.clientLegalName, "Client not entered"),
    clientPostalAddress: displayValue(preview.clientPostalAddress, "Postal address not entered"),
    serviceLines: preview.serviceLines.map((serviceLine, index) => ({
      renderKey: `${serviceLine.serviceDescription ?? "untitled"}-${serviceLine.periodStart ?? "start"}-${serviceLine.periodEnd ?? "end"}-${index + 1}`,
      billableDays: displayValue(serviceLine.billableDays, "Unavailable"),
      dayRate: displayValue(serviceLine.formattedDayRate, "Unavailable"),
      gross: draftLineTotal(serviceLine.formattedTotals, "gross"),
      net: draftLineTotal(serviceLine.formattedTotals, "net"),
      periodEnd: displayValue(serviceLine.periodEnd, "not entered"),
      periodStart: displayValue(serviceLine.periodStart, "not entered"),
      serviceDescription: displayValue(
        serviceLine.serviceDescription,
        "Service description not entered",
      ),
      vat: draftLineTotal(serviceLine.formattedTotals, "vat"),
      vatRate: serviceLine.vatRate,
    })),
    sterlingVatSummary: formatSterlingVatSummary(
      review.sterlingVatSummary,
      preview.currencyCode ?? "",
    ),
    taxPoint: preview.taxPoint,
    issueDate: displayValue(preview.issueDate, "Date not entered"),
    net: draftTotal(review, "net"),
    vat: draftTotal(review, "vat"),
    gross: draftTotal(review, "gross"),
    currencyCode: preview.currencyCode ?? "",
    paymentTerms: displayValue(preview.paymentTerms, "Not entered"),
    notes: documentNotes(displayValue(preview.purchaseOrder, ""), displayValue(preview.notes, "")),
    vatWording: preview.vatWording,
  };
}

function displayValue(value: string | null, fallback: string): string {
  return value ?? fallback;
}

function draftLineTotal(
  totals: Readonly<{ gross: string; net: string; vat: string }> | null,
  name: "gross" | "net" | "vat",
): string {
  return totals?.[name] ?? "Unavailable";
}

function draftTotal(
  review: InvoiceDraftReview,
  name: keyof NonNullable<InvoiceDraftReview["formattedTotals"]>,
): string {
  return review.formattedTotals ? review.formattedTotals[name] : "Unavailable";
}

function documentNotes(purchaseOrder: string, notes: string): readonly string[] {
  return [
    ...(purchaseOrder ? [`Purchase order: ${purchaseOrder}`] : []),
    ...(notes ? [notes] : []),
  ];
}
