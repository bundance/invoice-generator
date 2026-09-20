import type { z } from "zod";

import type { releasedWorkspaceStateV6Schema } from "./released-workspace-state-schemas.ts";

type ReleasedWorkspaceStateV6 = z.output<typeof releasedWorkspaceStateV6Schema>;
type ReleasedInvoiceDraftV6 = NonNullable<ReleasedWorkspaceStateV6["draft"]>["draft"];
type ReleasedIssuedInvoiceV6 = ReleasedWorkspaceStateV6["issuedInvoices"][number];
type ReleasedCreditNoteV6 = ReleasedWorkspaceStateV6["creditNotes"][number];

export function upgradeSchemaSixWorkspaceState(workspace: ReleasedWorkspaceStateV6) {
  return {
    ...workspace,
    schemaVersion: 7 as const,
    draft: workspace.draft
      ? { ...workspace.draft, draft: upgradeDraft(workspace.draft.draft) }
      : null,
    issuedInvoices: workspace.issuedInvoices.map(upgradeIssuedInvoice),
    creditNotes: workspace.creditNotes.map(upgradeCreditNote),
  };
}

function upgradeDraft(draft: ReleasedInvoiceDraftV6) {
  if (draft.vatTreatment === "outside-scope") {
    const { billableDays, dayRate, periodEnd, periodStart, serviceDescription, ...invoiceFields } =
      draft;
    const serviceLine = { billableDays, dayRate, periodEnd, periodStart, serviceDescription };
    return { ...invoiceFields, serviceLines: [serviceLine] as const };
  }

  const {
    billableDays,
    dayRate,
    periodEnd,
    periodStart,
    serviceDescription,
    vatRate,
    ...taxableInvoiceFields
  } = draft;
  return {
    ...taxableInvoiceFields,
    serviceLines: [
      { billableDays, dayRate, periodEnd, periodStart, serviceDescription, vatRate },
    ] as const,
  };
}

function upgradeIssuedInvoice(invoice: ReleasedIssuedInvoiceV6) {
  const {
    billableDays,
    dayRate,
    periodEnd,
    periodStart,
    serviceDescription,
    taxFacts,
    ...invoiceFields
  } = invoice;
  const commonServiceLine = {
    billableDays,
    dayRate,
    periodEnd,
    periodStart,
    serviceDescription,
    totals: invoice.totals,
  };
  const serviceLine =
    taxFacts.vatTreatment.kind === "uk-taxable"
      ? { ...commonServiceLine, vatRate: taxFacts.vatTreatment.rate }
      : commonServiceLine;
  return {
    ...invoiceFields,
    serviceLines: [serviceLine] as const,
    taxFacts: upgradeTaxFacts(taxFacts, invoice.totals.net),
  };
}

function upgradeCreditNote(creditNote: ReleasedCreditNoteV6) {
  const {
    billableDays,
    dayRate,
    periodEnd,
    periodStart,
    serviceDescription,
    taxFacts,
    ...creditNoteFields
  } = creditNote;
  const commonServiceLine = {
    billableDays,
    dayRate,
    periodEnd,
    periodStart,
    serviceDescription,
    totals: creditNote.totals,
  };
  const serviceLine =
    taxFacts.vatTreatment.kind === "uk-taxable"
      ? { ...commonServiceLine, vatRate: taxFacts.vatTreatment.rate }
      : commonServiceLine;
  return {
    ...creditNoteFields,
    serviceLines: [serviceLine] as const,
    taxFacts: upgradeTaxFacts(taxFacts, creditNote.totals.net),
  };
}

function upgradeTaxFacts(taxFacts: ReleasedIssuedInvoiceV6["taxFacts"], clientCurrencyNet: string) {
  if (taxFacts.vatTreatment.kind === "outside-scope") return taxFacts;

  const { rate, ...vatTreatment } = taxFacts.vatTreatment;
  if (taxFacts.kind !== "foreign-currency-uk-vat") {
    return { ...taxFacts, vatTreatment };
  }

  return {
    ...taxFacts,
    vatTreatment,
    sterlingVatSummary: {
      exchangeRecord: taxFacts.sterlingVatSummary.exchangeRecord,
      totalsByRate: [
        {
          clientCurrencyNet,
          sterlingTotals: taxFacts.sterlingVatSummary.totals,
          vatRate: rate,
        },
      ] as const,
      totals: taxFacts.sterlingVatSummary.totals,
    },
  };
}
