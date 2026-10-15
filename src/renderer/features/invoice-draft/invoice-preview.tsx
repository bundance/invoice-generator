import type { InvoiceDraftInput } from "../../../domain/invoices/invoice-draft.ts";
import {
  BillingPdfPreview,
  type BillingPdfPreviewReadiness,
} from "../../ui/billing-pdf-preview.tsx";

type InvoicePreviewProps = Readonly<{
  draft: InvoiceDraftInput;
  onReadyChange: (readiness: BillingPdfPreviewReadiness) => void;
  requestKey: string;
}>;

export function InvoicePreview({ draft, onReadyChange, requestKey }: InvoicePreviewProps) {
  return (
    <BillingPdfPreview
      ariaLabel="Invoice preview"
      onReadyChange={onReadyChange}
      request={{ input: draft, kind: "invoice" }}
      requestKey={requestKey}
    />
  );
}
