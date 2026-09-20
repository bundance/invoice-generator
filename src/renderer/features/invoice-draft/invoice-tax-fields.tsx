import type { InvoiceDraftInput } from "../../../domain/invoices/invoice-draft.ts";
import { outsideScopeWording, reverseChargeWording } from "../../../domain/tax/vat-wording.ts";
import { FormField } from "../../ui/form-controls.tsx";
import type { InvoiceDraftFieldGroupProps } from "./invoice-draft-field-group.ts";
import { InvoiceExchangeFields } from "./invoice-exchange-fields.tsx";

type InvoiceTaxFieldsProps = InvoiceDraftFieldGroupProps &
  Readonly<{
    draft: InvoiceDraftInput;
  }>;

export function InvoiceTaxFields({
  draft,
  draftForm,
  errorFor,
  onFieldBlur,
}: InvoiceTaxFieldsProps) {
  const isUkTaxable = draft.vatTreatment === "uk-taxable";

  return (
    <div className="draft-fields">
      <div className="settings-field settings-field--wide">
        <span className="settings-label">VAT treatment</span>
        <strong>{isUkTaxable ? "UK taxable" : "Outside the scope of UK VAT"}</strong>
      </div>
      {isUkTaxable ? (
        <>
          <FormField
            error={errorFor("taxPoint")}
            idPrefix="draft"
            label="Tax point"
            registration={draftForm.register("taxPoint", {
              onBlur: () => onFieldBlur("taxPoint"),
            })}
            type="date"
          />
          {draft.exchange.kind === "required" ? (
            <InvoiceExchangeFields
              currencyCode={draft.currencyCode}
              draftForm={draftForm}
              errorFor={errorFor}
              onFieldBlur={onFieldBlur}
            />
          ) : null}
        </>
      ) : (
        <>
          <FormField
            error={errorFor("outsideScopeEvidenceReference")}
            idPrefix="draft"
            label="Outside-scope evidence reference"
            multiline
            registration={draftForm.register("outsideScopeEvidenceReference", {
              onBlur: () => onFieldBlur("outsideScopeEvidenceReference"),
            })}
          />
          <label className="client-check-field settings-field--wide">
            <input type="checkbox" {...draftForm.register("reverseCharge")} />
            <span>
              <strong>Use reverse-charge wording</strong>
              <small>{draft.reverseCharge ? reverseChargeWording : outsideScopeWording}</small>
            </span>
          </label>
        </>
      )}
      <FormField
        error={errorFor("issueDate")}
        idPrefix="draft"
        label="Issue date"
        registration={draftForm.register("issueDate", {
          onBlur: () => onFieldBlur("issueDate"),
          onChange: (event) => {
            if (isUkTaxable && !draft.taxPoint) {
              draftForm.setValue("taxPoint", event.target.value, { shouldDirty: true });
            }
          },
        })}
        type="date"
      />
    </div>
  );
}
