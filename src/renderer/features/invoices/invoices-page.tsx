import { Files } from "lucide-react";
import { useState } from "react";

import type {
  FullCreditNoteIssueResult,
  ReplacementDraftCreateResult,
} from "../../../application/invoice-application-contract.ts";
import type { CreditNote } from "../../../domain/invoices/credit-note.ts";
import type { InvoiceId, IssuedInvoice } from "../../../domain/invoices/issued-invoice.ts";
import type { BusinessDate } from "../../../domain/time/business-date.ts";
import type { WorkspaceDestination } from "../../app/workspace-destination.ts";
import { EmptyState } from "../../ui/empty-state.tsx";
import { PageHeader } from "../../ui/page-header.tsx";
import { InvoiceHistoryItem } from "./invoice-history-item.tsx";
import { CreditNoteHistoryItem } from "./credit-note-history-item.tsx";
import { buildCorrectionChains } from "./correction-chains.ts";
import { FullCreditNoteFlow } from "./full-credit-note-flow.tsx";

type InvoicesPageProps = Readonly<{
  creditNotes: readonly CreditNote[];
  currentBusinessDate: BusinessDate;
  invoices: readonly IssuedInvoice[];
  onCreditNoteIssued: (result: Extract<FullCreditNoteIssueResult, { kind: "issued" }>) => void;
  onDestinationChange: (destination: WorkspaceDestination) => void;
  onReplacementCreated: (
    result: Extract<ReplacementDraftCreateResult, { kind: "created" }>,
  ) => void;
}>;

export function InvoicesPage({
  creditNotes,
  currentBusinessDate,
  invoices,
  onCreditNoteIssued,
  onDestinationChange,
  onReplacementCreated,
}: InvoicesPageProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<InvoiceId | null>(null);
  const selectedInvoice = invoices.find(({ id }) => id === selectedInvoiceId);
  if (selectedInvoice) {
    return (
      <FullCreditNoteFlow
        creditNote={
          creditNotes.find(({ originalInvoiceId }) => originalInvoiceId === selectedInvoice.id) ??
          null
        }
        currentBusinessDate={currentBusinessDate}
        invoice={selectedInvoice}
        onBack={() => setSelectedInvoiceId(null)}
        onOpenCurrentDraft={() => onDestinationChange("create")}
        onReplacementCreated={onReplacementCreated}
        replacementInvoiceId={
          invoices.find(({ replacesInvoiceId }) => replacesInvoiceId === selectedInvoice.id)?.id ??
          null
        }
        onIssued={onCreditNoteIssued}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Document record"
        heading="Invoices"
        summary="Issued invoices and credit notes will remain here as unchanging records."
      />
      {invoices.length === 0 ? (
        <EmptyState icon={Files} heading="No issued invoices yet">
          <p>Your first issued invoice and its retained PDF will appear here.</p>
          <button
            className="primary-action"
            onClick={() => onDestinationChange("create")}
            type="button"
          >
            Create invoice
          </button>
        </EmptyState>
      ) : (
        <section aria-label="Issued invoices" className="invoice-history-list">
          {buildCorrectionChains(invoices).map((chain) => {
            const firstInvoice = chain[0];
            if (!firstInvoice) return null;
            return (
              <section
                aria-label={`Correction chain from ${firstInvoice.id}`}
                className="document-chain"
                key={firstInvoice.id}
              >
                {chain.map((invoice) => {
                  const creditNote =
                    creditNotes.find(({ originalInvoiceId }) => originalInvoiceId === invoice.id) ??
                    null;
                  return (
                    <div key={invoice.id}>
                      <InvoiceHistoryItem
                        creditNote={creditNote}
                        invoice={invoice}
                        onCorrect={() => setSelectedInvoiceId(invoice.id)}
                      />
                      {creditNote ? <CreditNoteHistoryItem creditNote={creditNote} /> : null}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </section>
      )}
    </>
  );
}
