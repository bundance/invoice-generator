import { createInvoiceDraft, reviewInvoiceDraft } from "../../src/domain/invoices/invoice-draft.js";
import {
  attachRetainedInvoicePdf,
  createIssuedInvoiceSnapshot,
} from "../../src/domain/invoices/issued-invoice.js";
import {
  attachRetainedCreditNotePdf,
  createFullCreditNoteSnapshot,
  reviewFullCreditNote,
  type CreditNote,
} from "../../src/domain/invoices/credit-note.js";
import { parseBusinessDate } from "../../src/domain/time/business-date.js";
import {
  completeClient,
  completeForeignCurrencyVatClient,
  completeGbpVatClient,
} from "./client.js";
import { completeIssuer } from "./issuer-settings.js";

if (completeClient.vatTreatment.kind !== "outside-scope") {
  throw new Error("Expected an outside-scope client fixture");
}

export const completeInvoiceDraftInput = {
  clientId: completeClient.id,
  clientLegalName: completeClient.legalName,
  clientPostalAddress: completeClient.postalAddress,
  currencyCode: completeClient.currency.code,
  issueDate: "2026-09-04",
  serviceLines: [
    {
      billableDays: "4",
      dayRate: completeClient.standardDayRate,
      periodEnd: "2026-09-04",
      periodStart: "2026-09-01",
      serviceDescription: completeClient.defaultServiceDescription,
    },
  ],
  paymentTerms: completeClient.paymentTerms,
  notes: "",
  purchaseOrder: "",
  vatTreatment: "outside-scope",
  outsideScopeEvidenceReference: completeClient.vatTreatment.evidenceReference,
  reverseCharge: true,
} as const;

const completeInvoiceReview = reviewInvoiceDraft({
  client: completeClient,
  draft: completeInvoiceDraftInput,
  issuer: completeIssuer,
  today: parseBusinessDate("2026-09-04"),
});

if (!completeInvoiceReview.candidate) {
  throw new Error("Expected a valid invoice fixture candidate");
}

export const completeIssuedInvoice = attachRetainedInvoicePdf({
  pdf: { filename: "GGIOHK-0043.pdf", sha256: "b".repeat(64) },
  snapshot: createIssuedInvoiceSnapshot({
    candidate: completeInvoiceReview.candidate,
    invoiceNumber: "43",
    issuedAt: "2026-09-04T10:11:12.000Z",
    lateIssueDateAcknowledged: false,
  }),
});

const gbpVatDraft = createInvoiceDraft(completeGbpVatClient);
if (gbpVatDraft.vatTreatment !== "uk-taxable") {
  throw new Error("Expected a UK-taxable GBP draft fixture");
}

export const completeGbpVatInvoiceDraftInput = {
  ...gbpVatDraft,
  issueDate: "2026-09-06",
  serviceLines: [
    {
      ...gbpVatDraft.serviceLines[0],
      billableDays: "4",
      periodEnd: "2026-09-05",
      periodStart: "2026-09-02",
    },
  ],
  taxPoint: "2026-09-05",
} as const;

const completeGbpVatInvoiceReview = reviewInvoiceDraft({
  client: completeGbpVatClient,
  draft: completeGbpVatInvoiceDraftInput,
  issuer: completeIssuer,
  today: parseBusinessDate("2026-09-06"),
});

if (!completeGbpVatInvoiceReview.candidate) {
  throw new Error("Expected a valid GBP VAT invoice fixture candidate");
}

export const completeGbpVatIssuedInvoice = attachRetainedInvoicePdf({
  pdf: { filename: "ACME-0008.pdf", sha256: "c".repeat(64) },
  snapshot: createIssuedInvoiceSnapshot({
    candidate: completeGbpVatInvoiceReview.candidate,
    invoiceNumber: "8",
    issuedAt: "2026-09-06T10:11:12.000Z",
    lateIssueDateAcknowledged: false,
  }),
});

const foreignCurrencyVatDraft = createInvoiceDraft(completeForeignCurrencyVatClient);
if (foreignCurrencyVatDraft.vatTreatment !== "uk-taxable") {
  throw new Error("Expected a UK-taxable foreign-currency draft fixture");
}

export const completeForeignCurrencyVatInvoiceDraftInput = {
  ...foreignCurrencyVatDraft,
  exchange: {
    effectiveDate: "2026-09-05",
    evidenceReference: "HMRC monthly exchange rates, September 2026",
    kind: "required",
    method: "hmrc-period-rate",
    rate: "1.25",
  },
  issueDate: "2026-09-06",
  serviceLines: [
    {
      ...foreignCurrencyVatDraft.serviceLines[0],
      billableDays: "4",
      periodEnd: "2026-09-05",
      periodStart: "2026-09-02",
    },
  ],
  taxPoint: "2026-09-05",
} as const;

const completeForeignCurrencyVatInvoiceReview = reviewInvoiceDraft({
  client: completeForeignCurrencyVatClient,
  draft: completeForeignCurrencyVatInvoiceDraftInput,
  issuer: completeIssuer,
  today: parseBusinessDate("2026-09-06"),
});

if (!completeForeignCurrencyVatInvoiceReview.candidate) {
  throw new Error("Expected a valid foreign-currency VAT invoice fixture candidate");
}

export const completeForeignCurrencyVatIssuedInvoice = attachRetainedInvoicePdf({
  pdf: { filename: "USDVAT-0012.pdf", sha256: "d".repeat(64) },
  snapshot: createIssuedInvoiceSnapshot({
    candidate: completeForeignCurrencyVatInvoiceReview.candidate,
    invoiceNumber: "12",
    issuedAt: "2026-09-06T10:11:12.000Z",
    lateIssueDateAcknowledged: false,
  }),
});

export const completeCreditNote = createCreditNoteFixture(completeIssuedInvoice, "e");
export const completeGbpVatCreditNote = createCreditNoteFixture(completeGbpVatIssuedInvoice, "f");
export const completeForeignCurrencyVatCreditNote = createCreditNoteFixture(
  completeForeignCurrencyVatIssuedInvoice,
  "a",
);

function createCreditNoteFixture(
  invoice: typeof completeIssuedInvoice,
  hashCharacter: string,
): CreditNote {
  const today = parseBusinessDate("2026-09-07");
  const review = reviewFullCreditNote({
    input: {
      issueDate: today,
      originalInvoiceId: invoice.id,
      reason: "The billed service period was incorrect.",
    },
    invoice,
    today,
  });
  if (review.kind !== "ready") throw new Error("Expected a valid credit-note fixture");
  const snapshot = createFullCreditNoteSnapshot({
    candidate: review.candidate,
    issuedAt: "2026-09-07T10:11:12.000Z",
  });
  return attachRetainedCreditNotePdf({
    pdf: { filename: `${snapshot.id}.pdf`, sha256: hashCharacter.repeat(64) },
    snapshot,
  });
}
