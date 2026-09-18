import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { useWatch } from "react-hook-form";

import type { ClientInput } from "../../../domain/clients/client.ts";
import { currencies } from "../../../domain/money/currency.ts";
import { FormField, FormFieldError } from "../../ui/form-controls.tsx";

type ClientInvoiceDefaultFieldsProps = Readonly<{
  control: Control<ClientInput>;
  errors: FieldErrors<ClientInput>;
  register: UseFormRegister<ClientInput>;
}>;

export function ClientInvoiceDefaultFields({
  control,
  errors,
  register,
}: ClientInvoiceDefaultFieldsProps) {
  const vatTreatment = useWatch({ control, name: "vatTreatment" });

  return (
    <fieldset className="settings-fieldset">
      <legend>Invoice defaults</legend>
      <div className="settings-fields">
        <div className="settings-field">
          <label className="field-label" htmlFor="client-currencyCode">
            Currency
          </label>
          <select
            id="client-currencyCode"
            aria-describedby={errors.currencyCode ? "client-currencyCode-error" : undefined}
            aria-invalid={errors.currencyCode ? "true" : undefined}
            {...register("currencyCode")}
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} · {currency.name}
              </option>
            ))}
          </select>
          <FormFieldError error={errors.currencyCode?.message} id="client-currencyCode-error" />
        </div>
        <FormField
          error={errors.standardDayRate?.message}
          inputMode="decimal"
          label="Standard day rate"
          registration={register("standardDayRate")}
        />
        <div className="settings-field">
          <label className="field-label" htmlFor="client-vatTreatment">
            VAT treatment
          </label>
          <select id="client-vatTreatment" {...register("vatTreatment")}>
            <option value="uk-taxable">UK taxable</option>
            <option value="outside-scope">Outside the scope of UK VAT</option>
          </select>
        </div>
        {vatTreatment === "uk-taxable" ? (
          <FormField
            error={errors.vatRate?.message}
            inputMode="decimal"
            label="Default VAT rate"
            registration={register("vatRate")}
          />
        ) : (
          <>
            <FormField
              error={errors.outsideScopeEvidenceReference?.message}
              label="Outside-scope evidence reference"
              multiline
              registration={register("outsideScopeEvidenceReference")}
            />
            <label className="client-check-field">
              <span className="client-check-control">
                <input
                  aria-label="Reverse charge applies"
                  type="checkbox"
                  {...register("reverseCharge")}
                />
              </span>
              <span>
                <strong>Reverse charge applies</strong>
                <small>Add the approved wording for the country of receipt.</small>
              </span>
            </label>
          </>
        )}
        <FormField
          error={errors.defaultServiceDescription?.message}
          label="Default service description"
          multiline
          registration={register("defaultServiceDescription")}
        />
        <FormField
          error={errors.paymentTerms?.message}
          label="Payment terms"
          registration={register("paymentTerms")}
        />
      </div>
    </fieldset>
  );
}
