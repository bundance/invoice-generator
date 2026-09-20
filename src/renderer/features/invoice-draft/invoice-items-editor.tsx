import type {
  InvoiceDraftInput,
  InvoiceDraftReview,
} from "../../../domain/invoices/invoice-draft.ts";
import type { InvoiceServiceLineFieldName } from "../../../domain/invoices/invoice-service-line.ts";
import { InvoiceItemAccordion } from "./invoice-item-accordion.tsx";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";
import type { InvoiceDraftItems } from "./use-invoice-draft-items.ts";

type InvoiceItemsEditorProps = Readonly<{
  draft: InvoiceDraftInput;
  draftForm: InvoiceDraftForm;
  errorFor: (
    index: number,
    fieldId: string,
    fieldName: InvoiceServiceLineFieldName,
  ) => string | undefined;
  items: InvoiceDraftItems;
  onFieldBlur: (fieldId: string, fieldName: InvoiceServiceLineFieldName) => void;
  review: InvoiceDraftReview;
}>;

export function InvoiceItemsEditor({
  draft,
  draftForm,
  errorFor,
  items,
  onFieldBlur,
  review,
}: InvoiceItemsEditorProps) {
  return (
    <div className="invoice-items-editor settings-field--wide">
      <header>
        <div>
          <span className="settings-label">Invoice items</span>
          <small>
            {items.fields.length} item{items.fields.length === 1 ? "" : "s"}
          </small>
        </div>
        <button className="secondary-action" onClick={items.addItem} type="button">
          + Add item
        </button>
      </header>
      <InvoiceItemAccordion
        draft={draft}
        draftForm={draftForm}
        errorFor={errorFor}
        items={items}
        onFieldBlur={onFieldBlur}
        previews={review.preview.serviceLines}
      />
      <dl className="invoice-items-total">
        <div>
          <dt>Net</dt>
          <dd>{review.formattedTotals?.net ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>VAT</dt>
          <dd>{review.formattedTotals?.vat ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{review.formattedTotals?.gross ?? "Unavailable"}</dd>
        </div>
      </dl>
    </div>
  );
}
