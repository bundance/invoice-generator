import type {
  InvoiceDraftInput,
  InvoiceDraftReview,
} from "../../../domain/invoices/invoice-draft.ts";
import type { InvoiceServiceLineFieldName } from "../../../domain/invoices/invoice-service-line.ts";
import { FormField } from "../../ui/form-controls.tsx";
import type { InvoiceDraftFieldGroupProps } from "./invoice-draft-field-group.ts";
import type { InvoiceDraftItems } from "./invoice-draft-items.types.ts";
import { InvoiceItemsEditor } from "./invoice-items-editor.tsx";

type InvoiceWorkFieldsProps = InvoiceDraftFieldGroupProps &
  Readonly<{
    draft: InvoiceDraftInput;
    items: InvoiceDraftItems;
    onServiceLineFieldBlur: (fieldId: string, fieldName: InvoiceServiceLineFieldName) => void;
    review: InvoiceDraftReview;
    serviceLineErrorFor: (
      index: number,
      fieldId: string,
      fieldName: InvoiceServiceLineFieldName,
    ) => string | undefined;
  }>;

export function InvoiceWorkFields({
  draft,
  draftForm,
  errorFor,
  items,
  onFieldBlur,
  onServiceLineFieldBlur,
  review,
  serviceLineErrorFor,
}: InvoiceWorkFieldsProps) {
  return (
    <div className="draft-fields">
      <InvoiceItemsEditor
        draft={draft}
        draftForm={draftForm}
        errorFor={serviceLineErrorFor}
        items={items}
        onFieldBlur={onServiceLineFieldBlur}
        review={review}
      />
      <FormField
        error={errorFor("purchaseOrder")}
        idPrefix="draft"
        label="Purchase order"
        registration={draftForm.register("purchaseOrder", {
          onBlur: () => onFieldBlur("purchaseOrder"),
        })}
      />
      <FormField
        error={errorFor("notes")}
        idPrefix="draft"
        label="Notes"
        multiline
        registration={draftForm.register("notes", { onBlur: () => onFieldBlur("notes") })}
      />
    </div>
  );
}
