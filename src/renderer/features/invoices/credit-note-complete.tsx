import type { CreditNote } from "../../../domain/invoices/credit-note.ts";
import type { InvoiceId, IssuedInvoice } from "../../../domain/invoices/issued-invoice.ts";
import { RetainedDocumentActions } from "./retained-document-actions.tsx";

type CreditNoteCompleteProps = Readonly<{
  creditNote: CreditNote;
  invoice: IssuedInvoice;
  onBack: () => void;
  onCreateReplacement: () => void;
  onDiscardAndCreateReplacement: () => void;
  onOpenCurrentDraft: () => void;
  replacementFeedback: string | null;
  replacementHasDraftConflict: boolean;
  replacementInvoiceId: InvoiceId | null;
  replacementIsCreating: boolean;
}>;

export function CreditNoteComplete({
  creditNote,
  invoice,
  onBack,
  onCreateReplacement,
  onDiscardAndCreateReplacement,
  onOpenCurrentDraft,
  replacementFeedback,
  replacementHasDraftConflict,
  replacementInvoiceId,
  replacementIsCreating,
}: CreditNoteCompleteProps) {
  return (
    <section className="credit-note-complete" aria-labelledby="credit-note-complete-heading">
      <p className="eyebrow">Step 2 of 3 · Check the record</p>
      <h1 id="credit-note-complete-heading">The original is fully credited.</h1>
      <p>
        {invoice.id} remains unchanged. {creditNote.id} is its linked full credit note, and both
        exact PDFs are retained.
      </p>
      <div className="credit-note-retained-records">
        <section aria-label={`Original invoice ${invoice.id}`}>
          <h2>{invoice.id}</h2>
          <RetainedDocumentActions documentId={invoice.id} />
        </section>
        <section aria-label={`Full credit note ${creditNote.id}`}>
          <h2>{creditNote.id}</h2>
          <RetainedDocumentActions documentId={creditNote.id} />
        </section>
      </div>
      {replacementFeedback ? <p className="validation-summary">{replacementFeedback}</p> : null}
      <div className="credit-note-complete-actions">
        <ReplacementAction
          hasDraftConflict={replacementHasDraftConflict}
          isCreating={replacementIsCreating}
          onCreate={onCreateReplacement}
          onDiscardAndCreate={onDiscardAndCreateReplacement}
          onOpenCurrentDraft={onOpenCurrentDraft}
          replacementInvoiceId={replacementInvoiceId}
        />
        <button className="secondary-action" onClick={onBack} type="button">
          Done
        </button>
      </div>
    </section>
  );
}

type ReplacementActionProps = Readonly<{
  hasDraftConflict: boolean;
  isCreating: boolean;
  onCreate: () => void;
  onDiscardAndCreate: () => void;
  onOpenCurrentDraft: () => void;
  replacementInvoiceId: InvoiceId | null;
}>;

function ReplacementAction({
  hasDraftConflict,
  isCreating,
  onCreate,
  onDiscardAndCreate,
  onOpenCurrentDraft,
  replacementInvoiceId,
}: ReplacementActionProps) {
  if (replacementInvoiceId) return <p>{replacementInvoiceId} is the issued replacement.</p>;
  if (hasDraftConflict) {
    return (
      <>
        <button className="secondary-action" onClick={onOpenCurrentDraft} type="button">
          Keep current draft
        </button>
        <button className="primary-action" onClick={onDiscardAndCreate} type="button">
          Discard current draft and create replacement
        </button>
      </>
    );
  }
  return (
    <button className="primary-action" disabled={isCreating} onClick={onCreate} type="button">
      {isCreating ? "Creating replacement…" : "Create replacement"}
    </button>
  );
}
