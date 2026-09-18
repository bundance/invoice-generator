import type { FullCreditNoteCandidate } from "../../../domain/invoices/credit-note.ts";
import { BillingDocument } from "../../../documents/invoice-document.tsx";
import { createCreditNoteDocumentModel } from "../../../documents/invoice-document-model.ts";
import { LiveA4PreviewFrame } from "../../ui/live-a4-preview-frame.tsx";

type CreditNotePreviewProps = Readonly<{ candidate: FullCreditNoteCandidate }>;

export function CreditNotePreview({ candidate }: CreditNotePreviewProps) {
  return (
    <LiveA4PreviewFrame ariaLabel="Credit note preview" documentId={candidate.id}>
      <BillingDocument model={createCreditNoteDocumentModel(candidate)} />
    </LiveA4PreviewFrame>
  );
}
