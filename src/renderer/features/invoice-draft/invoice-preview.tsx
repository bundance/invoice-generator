import { BillingDocument } from "../../../documents/invoice-document.tsx";
import { createDraftInvoiceDocumentModel } from "../../../documents/invoice-document-model.ts";
import type { InvoiceDraftReview } from "../../../domain/invoices/invoice-draft.ts";
import type { IssuerSettings } from "../../../domain/issuer/issuer-settings.ts";
import { LiveA4PreviewFrame } from "../../ui/live-a4-preview-frame.tsx";

type InvoicePreviewProps = Readonly<{
  issuer: IssuerSettings;
  review: InvoiceDraftReview;
}>;

export function InvoicePreview({ issuer, review }: InvoicePreviewProps) {
  const model = createDraftInvoiceDocumentModel(issuer, review);

  return (
    <LiveA4PreviewFrame ariaLabel="Invoice preview" documentId={model.id}>
      <BillingDocument model={model} />
    </LiveA4PreviewFrame>
  );
}
