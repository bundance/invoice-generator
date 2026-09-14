import { BillingDocument } from "../../../documents/invoice-document.tsx";
import { createDraftInvoiceDocumentModel } from "../../../documents/invoice-document-model.ts";
import type { InvoiceDraftReview } from "../../../domain/invoices/invoice-draft.ts";
import type { IssuerSettings } from "../../../domain/issuer/issuer-settings.ts";

type InvoicePreviewProps = Readonly<{
  issuer: IssuerSettings;
  review: InvoiceDraftReview;
}>;

export function InvoicePreview({ issuer, review }: InvoicePreviewProps) {
  const model = createDraftInvoiceDocumentModel(issuer, review);

  return (
    <section className="preview-panel" aria-label="Invoice preview">
      <div className="preview-toolbar">
        <span>Live A4 preview</span>
        <small>{model.id}</small>
      </div>
      <div className="invoice-preview-viewport">
        <div className="invoice-preview-scale">
          <BillingDocument model={model} />
        </div>
      </div>
    </section>
  );
}
