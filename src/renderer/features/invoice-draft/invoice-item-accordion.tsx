import type { InvoiceDraftInput } from "../../../domain/invoices/invoice-draft.ts";
import type {
  InvoiceServiceLineFieldName,
  InvoiceServiceLinePreview,
} from "../../../domain/invoices/invoice-service-line.ts";
import type { InvoiceDraftItems } from "./invoice-draft-items.types.ts";
import { InvoiceItemFields } from "./invoice-item-fields.tsx";
import { InvoiceItemSummary } from "./invoice-item-summary.tsx";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";

type InvoiceItemAccordionProps = Readonly<{
  draft: InvoiceDraftInput;
  draftForm: InvoiceDraftForm;
  errorFor: (
    index: number,
    fieldId: string,
    fieldName: InvoiceServiceLineFieldName,
  ) => string | undefined;
  items: InvoiceDraftItems;
  onFieldBlur: (fieldId: string, fieldName: InvoiceServiceLineFieldName) => void;
  previews: readonly InvoiceServiceLinePreview[];
}>;

export function InvoiceItemAccordion({
  draft,
  draftForm,
  errorFor,
  items,
  onFieldBlur,
  previews,
}: InvoiceItemAccordionProps) {
  return (
    <div className="invoice-item-list">
      {items.fields.map((field, index) => (
        <InvoiceItem
          draft={draft}
          draftForm={draftForm}
          errorFor={errorFor}
          field={field}
          index={index}
          items={items}
          key={field.id}
          onFieldBlur={onFieldBlur}
          preview={previews[index] ?? previews[0]}
        />
      ))}
    </div>
  );
}

type InvoiceItemProps = Omit<InvoiceItemAccordionProps, "previews"> &
  Readonly<{
    field: InvoiceDraftItems["fields"][number];
    index: number;
    preview: InvoiceServiceLinePreview | undefined;
  }>;

function InvoiceItem({
  draft,
  draftForm,
  errorFor,
  field,
  index,
  items,
  onFieldBlur,
  preview,
}: InvoiceItemProps) {
  if (!preview) return null;
  const isActive = field.id === items.activeFieldId;
  const panelId = `invoice-item-panel-${field.id}`;
  const summaryId = `invoice-item-summary-${field.id}`;
  return (
    <section className={`invoice-item${isActive ? " invoice-item--active" : ""}`}>
      <div className="invoice-item-heading">
        <button
          aria-controls={panelId}
          aria-expanded={isActive}
          className="invoice-item-summary"
          id={summaryId}
          onClick={() => items.openItem(isActive ? null : field.id)}
          type="button"
        >
          <InvoiceItemSummary index={index} preview={preview} />
          <span aria-hidden="true" className="invoice-item-chevron">
            ▾
          </span>
        </button>
        <button
          aria-label={`Delete item ${index + 1}`}
          className="invoice-item-delete"
          disabled={items.fields.length === 1}
          onClick={() => items.deleteItem(index)}
          type="button"
        >
          ×
        </button>
      </div>
      <section
        aria-labelledby={summaryId}
        className="invoice-item-panel"
        hidden={!isActive}
        id={panelId}
      >
        <InvoiceItemFields
          draftForm={draftForm}
          errorFor={errorFor}
          fieldId={field.id}
          index={index}
          isUkTaxable={draft.vatTreatment === "uk-taxable"}
          onFieldBlur={onFieldBlur}
        />
        <div className="invoice-item-totals" aria-live="polite">
          <span>
            Net<strong>{preview.formattedTotals?.net ?? "Unavailable"}</strong>
          </span>
          <span>
            VAT<strong>{preview.formattedTotals?.vat ?? "Unavailable"}</strong>
          </span>
          <span>
            Gross<strong>{preview.formattedTotals?.gross ?? "Unavailable"}</strong>
          </span>
        </div>
        <button
          className="invoice-item-duplicate"
          onClick={() => items.duplicateItem(index)}
          type="button"
        >
          Duplicate item
        </button>
      </section>
    </section>
  );
}
