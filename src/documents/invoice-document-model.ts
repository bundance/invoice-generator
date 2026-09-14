import type { InvoiceCandidate, InvoiceDraftReview } from "../domain/invoices/invoice-draft.ts";
import type {
  CreditNote,
  CreditNoteSnapshot,
  CreditNoteTaxFacts,
  FullCreditNoteCandidate,
} from "../domain/invoices/credit-note.ts";
import type { InvoiceTaxFacts } from "../domain/invoices/invoice-tax-facts.ts";
import type { IssuedInvoice, IssuedInvoiceSnapshot } from "../domain/invoices/issued-invoice.ts";
import type { IssuerSettings } from "../domain/issuer/issuer-settings.ts";
import { formatCurrencyAmount } from "../domain/money/decimal.ts";
import { formatSterlingVatSummary, type SterlingVatDetails } from "./exchange-presentation.ts";

type SharedBillingDocumentModel = Readonly<{
  id: string;
  issuer: IssuerSettings;
  clientLegalName: string;
  clientPostalAddress: string;
  serviceDescription: string;
  sterlingVatSummary: SterlingVatDetails | null;
  taxPoint: string | null;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  billableDays: string;
  dayRate: string;
  net: string;
  vat: string;
  gross: string;
  currencyCode: string;
  paymentTerms: string;
  notes: readonly string[];
  vatWording: string;
  vatRate: string | null;
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
): BillingDocumentModel {
  return {
    ...createFinalBillingDocumentModel({ ...invoice, issueDate: invoice.issue.date }),
    kind: "issued-invoice",
  };
}

export function createCreditNoteDocumentModel(
  creditNote: CreditNote | CreditNoteSnapshot | FullCreditNoteCandidate,
): BillingDocumentModel {
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
): BillingDocumentModel {
  return { ...createFinalBillingDocumentModel(candidate), kind: "issued-invoice" };
}

type FinalBillingDocumentFacts = Readonly<{
  billableDays: string;
  client: Readonly<{ legalName: string; postalAddress: string }>;
  currency: Readonly<{ code: string; minorUnit: number }>;
  dayRate: string;
  id?: string;
  issuer: IssuerSettings;
  issueDate: string;
  notes: string;
  paymentTerms: string;
  periodEnd: string;
  periodStart: string;
  proposedInvoiceId?: string;
  purchaseOrder: string;
  serviceDescription: string;
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
    serviceDescription: document.serviceDescription,
    sterlingVatSummary: taxPresentation.sterlingVatSummary,
    taxPoint: taxPresentation.taxPoint,
    periodStart: document.periodStart,
    periodEnd: document.periodEnd,
    issueDate: document.issueDate,
    billableDays: document.billableDays,
    dayRate: formatAmount(document.dayRate),
    net: formatAmount(document.totals.net),
    vat: formatAmount(document.totals.vat),
    gross: formatAmount(document.totals.gross),
    currencyCode: document.currency.code,
    paymentTerms: document.paymentTerms,
    notes: documentNotes(document.purchaseOrder, document.notes),
    vatWording: taxPresentation.vatWording,
    vatRate: taxPresentation.vatRate,
  };
}

type TaxPresentation = Readonly<{
  sterlingVatSummary: SterlingVatDetails | null;
  taxPoint: string | null;
  vatRate: string | null;
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
    vatRate: ukTaxTreatment?.rate ?? null,
    vatWording: taxFacts.vatTreatment.wording,
  };
}

function resolveFinalDocumentId(document: FinalBillingDocumentFacts): string {
  return document.id ?? document.proposedInvoiceId ?? "Unnumbered draft";
}

export function createDraftInvoiceDocumentModel(
  issuer: IssuerSettings,
  review: InvoiceDraftReview,
): BillingDocumentModel {
  const preview = review.preview;
  return {
    kind: "draft-invoice",
    id: displayValue(preview.proposedInvoiceId, "Unnumbered draft"),
    issuer,
    clientLegalName: displayValue(preview.clientLegalName, "Client not entered"),
    clientPostalAddress: displayValue(preview.clientPostalAddress, "Postal address not entered"),
    serviceDescription: displayValue(preview.serviceDescription, "Service description not entered"),
    sterlingVatSummary: formatSterlingVatSummary(
      review.sterlingVatSummary,
      preview.currencyCode ?? "",
    ),
    taxPoint: preview.taxPoint,
    periodStart: displayValue(preview.periodStart, "not entered"),
    periodEnd: displayValue(preview.periodEnd, "not entered"),
    issueDate: displayValue(preview.issueDate, "Date not entered"),
    billableDays: displayValue(preview.billableDays, "Unavailable"),
    dayRate: displayValue(preview.formattedDayRate, "Unavailable"),
    net: draftTotal(review, "net"),
    vat: draftTotal(review, "vat"),
    gross: draftTotal(review, "gross"),
    currencyCode: preview.currencyCode ?? "",
    paymentTerms: displayValue(preview.paymentTerms, "Not entered"),
    notes: documentNotes(displayValue(preview.purchaseOrder, ""), displayValue(preview.notes, "")),
    vatWording: preview.vatWording,
    vatRate: preview.vatRate,
  };
}

function displayValue(value: string | null, fallback: string): string {
  return value ?? fallback;
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
