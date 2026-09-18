import type { FullCreditNoteCandidate } from "../../../domain/invoices/credit-note.ts";
import { BillingDocument } from "../../../documents/invoice-document.tsx";
import { createCreditNoteDocumentModel } from "../../../documents/invoice-document-model.ts";
import type { BillingDocumentFontReadiness } from "../../ui/billing-document-font-gate.tsx";
import { LiveA4PreviewFrame } from "../../ui/live-a4-preview-frame.tsx";

type CreditNotePreviewProps = Readonly<{
  candidate: FullCreditNoteCandidate;
  fontReadiness: BillingDocumentFontReadiness;
}>;

export function CreditNotePreview({ candidate, fontReadiness }: CreditNotePreviewProps) {
  return (
    <LiveA4PreviewFrame
      ariaLabel="Credit note preview"
      documentId={candidate.id}
      fontReadiness={fontReadiness}
    >
      <BillingDocument embedFonts={false} model={createCreditNoteDocumentModel(candidate)} />
    </LiveA4PreviewFrame>
  );
}
