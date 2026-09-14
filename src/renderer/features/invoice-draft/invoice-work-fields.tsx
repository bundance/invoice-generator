import { FormField } from "../../ui/form-controls.tsx";
import type { InvoiceDraftFieldGroupProps } from "./invoice-draft-field-group.ts";

export function InvoiceWorkFields({
  draftForm,
  errorFor,
  onFieldBlur,
}: InvoiceDraftFieldGroupProps) {
  return (
    <div className="draft-fields">
      <FormField
        error={errorFor("serviceDescription")}
        idPrefix="draft"
        label="Service description"
        multiline
        multilineRows={5}
        registration={draftForm.register("serviceDescription", {
          onBlur: () => onFieldBlur("serviceDescription"),
        })}
      />
      <FormField
        error={errorFor("periodStart")}
        idPrefix="draft"
        label="Period start"
        registration={draftForm.register("periodStart", {
          onBlur: () => onFieldBlur("periodStart"),
        })}
        type="date"
      />
      <FormField
        error={errorFor("periodEnd")}
        idPrefix="draft"
        label="Period end"
        registration={draftForm.register("periodEnd", {
          onBlur: () => onFieldBlur("periodEnd"),
        })}
        type="date"
      />
      <FormField
        error={errorFor("billableDays")}
        idPrefix="draft"
        inputMode="decimal"
        label="Billable days"
        registration={draftForm.register("billableDays", {
          onBlur: () => onFieldBlur("billableDays"),
        })}
      />
      <FormField
        error={errorFor("dayRate")}
        idPrefix="draft"
        inputMode="decimal"
        label="Day rate"
        registration={draftForm.register("dayRate", {
          onBlur: () => onFieldBlur("dayRate"),
        })}
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
