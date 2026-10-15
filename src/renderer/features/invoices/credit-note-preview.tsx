import type { FullCreditNoteInput } from "../../../domain/invoices/credit-note.ts";
import {
  BillingPdfPreview,
  type BillingPdfPreviewReadiness,
} from "../../ui/billing-pdf-preview.tsx";

type CreditNotePreviewProps = Readonly<{
  input: FullCreditNoteInput;
  onReadyChange: (readiness: BillingPdfPreviewReadiness) => void;
  requestKey: string;
}>;

export function CreditNotePreview({ input, onReadyChange, requestKey }: CreditNotePreviewProps) {
  return (
    <BillingPdfPreview
      ariaLabel="Credit note preview"
      onReadyChange={onReadyChange}
      request={{ input, kind: "credit-note" }}
      requestKey={requestKey}
    />
  );
}
