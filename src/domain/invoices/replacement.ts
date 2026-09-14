import { z } from "zod";

import type { Client } from "../clients/client.ts";
import { creditNoteMatchesInvoice, type CreditNote } from "./credit-note.ts";
import { persistedInvoiceDraftSchema, type InvoiceDraft } from "./invoice-draft.ts";
import { parseInvoiceId, type IssuedInvoice } from "./issued-invoice.ts";

export const replacementDraftSourceSchema = z.string().transform(parseInvoiceId);

export type ReplacementDraftSource = z.output<typeof replacementDraftSourceSchema>;

type CreateReplacementDraftOptions = Readonly<{
  client: Client;
  creditNote: CreditNote;
  invoice: IssuedInvoice;
}>;

export type ReplacementDraft = Readonly<{
  draft: InvoiceDraft;
  source: ReplacementDraftSource;
}>;

export function createReplacementDraft({
  client,
  creditNote,
  invoice,
}: CreateReplacementDraftOptions): ReplacementDraft {
  if (client.id !== invoice.client.id || !creditNoteMatchesInvoice(creditNote, invoice)) {
    throw new Error("A replacement requires the current client and full credit note");
  }

  return {
    draft: persistedInvoiceDraftSchema.parse({
      billableDays: invoice.billableDays,
      clientId: client.id,
      clientLegalName: invoice.client.legalName,
      clientPostalAddress: invoice.client.postalAddress,
      currencyCode: invoice.currency.code,
      dayRate: invoice.dayRate,
      issueDate: "",
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      periodEnd: invoice.periodEnd,
      periodStart: invoice.periodStart,
      purchaseOrder: invoice.purchaseOrder,
      serviceDescription: invoice.serviceDescription,
      ...copyTaxFields(invoice),
    }),
    source: replacementDraftSourceSchema.parse(invoice.id),
  };
}

function copyTaxFields(invoice: IssuedInvoice) {
  const { taxFacts } = invoice;
  if (taxFacts.kind === "outside-scope") {
    return {
      outsideScopeEvidenceReference: taxFacts.vatTreatment.evidenceReference,
      reverseCharge: taxFacts.vatTreatment.reverseCharge,
      vatTreatment: "outside-scope",
    } as const;
  }

  return {
    exchange:
      taxFacts.kind === "foreign-currency-uk-vat"
        ? { ...taxFacts.sterlingVatSummary.exchangeRecord, kind: "required" as const }
        : { kind: "not-required" as const },
    taxPoint: taxFacts.vatTreatment.taxPoint,
    vatRate: taxFacts.vatTreatment.rate,
    vatTreatment: "uk-taxable",
  } as const;
}
