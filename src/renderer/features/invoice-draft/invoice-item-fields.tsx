import type { InvoiceServiceLineFieldName } from "../../../domain/invoices/invoice-service-line.ts";
import { FormField } from "../../ui/form-controls.tsx";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";
import { lineInputId } from "./use-invoice-draft-review.ts";

type InvoiceItemFieldsProps = Readonly<{
  draftForm: InvoiceDraftForm;
  fieldId: string;
  index: number;
  isUkTaxable: boolean;
  onFieldBlur: (fieldId: string, fieldName: InvoiceServiceLineFieldName) => void;
  errorFor: (
    index: number,
    fieldId: string,
    fieldName: InvoiceServiceLineFieldName,
  ) => string | undefined;
}>;

export function InvoiceItemFields({
  draftForm,
  errorFor,
  fieldId,
  index,
  isUkTaxable,
  onFieldBlur,
}: InvoiceItemFieldsProps) {
  function field(fieldName: InvoiceServiceLineFieldName) {
    return {
      error: errorFor(index, fieldId, fieldName),
      id: lineInputId(fieldId, fieldName),
    };
  }

  const blur = (fieldName: InvoiceServiceLineFieldName) => () => onFieldBlur(fieldId, fieldName);

  return (
    <div className="invoice-item-fields">
      <FormField
        {...field("serviceDescription")}
        label="Service description"
        multiline
        multilineRows={4}
        registration={draftForm.register(`serviceLines.${index}.serviceDescription`, {
          onBlur: blur("serviceDescription"),
        })}
      />
      <FormField
        {...field("periodStart")}
        label="Period start"
        registration={draftForm.register(`serviceLines.${index}.periodStart`, {
          onBlur: blur("periodStart"),
        })}
        type="date"
      />
      <FormField
        {...field("periodEnd")}
        label="Period end"
        registration={draftForm.register(`serviceLines.${index}.periodEnd`, {
          onBlur: blur("periodEnd"),
        })}
        type="date"
      />
      <FormField
        {...field("billableDays")}
        inputMode="decimal"
        label="Billable days"
        registration={draftForm.register(`serviceLines.${index}.billableDays`, {
          onBlur: blur("billableDays"),
        })}
      />
      <FormField
        {...field("dayRate")}
        inputMode="decimal"
        label="Day rate"
        registration={draftForm.register(`serviceLines.${index}.dayRate`, {
          onBlur: blur("dayRate"),
        })}
      />
      {isUkTaxable ? (
        <FormField
          {...field("vatRate")}
          inputMode="decimal"
          label="VAT rate"
          registration={draftForm.register(`serviceLines.${index}.vatRate`, {
            onBlur: blur("vatRate"),
          })}
        />
      ) : null}
    </div>
  );
}
