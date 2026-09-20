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

type ReplacementWorkspace = Readonly<{
  creditNotes: readonly Pick<CreditNote, "originalInvoiceId">[];
  draft: Readonly<{ kind: "ordinary" }> | Readonly<{ kind: "replacement"; source: string }> | null;
  issuedInvoices: readonly Pick<IssuedInvoice, "id" | "replacesInvoiceId">[];
}>;

export function replacementDraftHasValidSource(workspace: ReplacementWorkspace): boolean {
  if (workspace.draft?.kind !== "replacement") return true;
  const source = workspace.draft.source;
  const original = workspace.issuedInvoices.find(({ id }) => id === source);
  if (!original) return false;
  return (
    workspace.creditNotes.some(({ originalInvoiceId }) => originalInvoiceId === original.id) &&
    !workspace.issuedInvoices.some(({ replacesInvoiceId }) => replacesInvoiceId === original.id)
  );
}

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
      clientId: client.id,
      clientLegalName: invoice.client.legalName,
      clientPostalAddress: invoice.client.postalAddress,
      currencyCode: invoice.currency.code,
      issueDate: "",
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      purchaseOrder: invoice.purchaseOrder,
      serviceLines: invoice.serviceLines.map(({ totals: _totals, ...serviceLine }) => serviceLine),
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
    vatTreatment: "uk-taxable",
  } as const;
}
