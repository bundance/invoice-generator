import type { FullCreditNoteCandidate } from "../../../domain/invoices/credit-note.ts";
import { BillingDocument } from "../../../documents/invoice-document.tsx";
import { createCreditNoteDocumentModel } from "../../../documents/invoice-document-model.ts";

type CreditNotePreviewProps = Readonly<{ candidate: FullCreditNoteCandidate }>;

export function CreditNotePreview({ candidate }: CreditNotePreviewProps) {
  return (
    <section aria-label="Credit note preview" className="preview-panel">
      <div className="preview-toolbar">
        <span>Live A4 preview</span>
        <small>{candidate.id}</small>
      </div>
      <div className="invoice-preview-viewport">
        <div className="invoice-preview-scale">
          <BillingDocument model={createCreditNoteDocumentModel(candidate)} />
        </div>
      </div>
    </section>
  );
}
