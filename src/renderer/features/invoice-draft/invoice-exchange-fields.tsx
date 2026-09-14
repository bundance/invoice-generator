import { exchangeMethods } from "../../../domain/invoices/exchange-record.ts";
import { exchangeMethodLabels } from "../../../documents/exchange-presentation.ts";
import { FormField, FormFieldError } from "../../ui/form-controls.tsx";
import type { InvoiceDraftFieldGroupProps } from "./invoice-draft-field-group.ts";

type InvoiceExchangeFieldsProps = InvoiceDraftFieldGroupProps & Readonly<{ currencyCode: string }>;

export function InvoiceExchangeFields({
  currencyCode,
  draftForm,
  errorFor,
  onFieldBlur,
}: InvoiceExchangeFieldsProps) {
  const exchangeMethodError = errorFor("exchangeMethod");

  return (
    <>
      <div className="exchange-direction settings-field settings-field--wide">
        <span className="settings-label">Rate direction</span>
        <strong>1 GBP equals the entered amount in {currencyCode}</strong>
      </div>
      <FormField
        error={errorFor("exchangeRate")}
        id="draft-exchangeRate"
        inputMode="decimal"
        label={`Exchange rate (${currencyCode} per GBP)`}
        registration={draftForm.register("exchange.rate", {
          onBlur: () => onFieldBlur("exchangeRate"),
        })}
      />
      <FormField
        error={errorFor("exchangeEffectiveDate")}
        id="draft-exchangeEffectiveDate"
        label="Exchange-rate effective date"
        registration={draftForm.register("exchange.effectiveDate", {
          onBlur: () => onFieldBlur("exchangeEffectiveDate"),
        })}
        type="date"
      />
      <div className="settings-field">
        <label className="field-label" htmlFor="draft-exchangeMethod">
          Exchange-rate method
        </label>
        <select
          aria-describedby={exchangeMethodError ? "draft-exchangeMethod-error" : undefined}
          aria-invalid={exchangeMethodError ? "true" : undefined}
          id="draft-exchangeMethod"
          {...draftForm.register("exchange.method", {
            onBlur: () => onFieldBlur("exchangeMethod"),
          })}
        >
          <option value="">Choose a method</option>
          {exchangeMethods.map((method) => (
            <option key={method} value={method}>
              {exchangeMethodLabels[method]}
            </option>
          ))}
        </select>
        <FormFieldError error={exchangeMethodError} id="draft-exchangeMethod-error" />
      </div>
      <FormField
        error={errorFor("exchangeEvidenceReference")}
        id="draft-exchangeEvidenceReference"
        label="Exchange-rate evidence reference"
        multiline
        registration={draftForm.register("exchange.evidenceReference", {
          onBlur: () => onFieldBlur("exchangeEvidenceReference"),
        })}
      />
    </>
  );
}
