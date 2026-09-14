import type { FieldErrors, UseFormRegister } from "react-hook-form";

import type { ClientInput } from "../../../domain/clients/client.ts";
import { FormField } from "../../ui/form-controls.tsx";

type ClientSequenceFieldsProps = Readonly<{
  errors: FieldErrors<ClientInput>;
  invoiceReadOnly: boolean;
  register: UseFormRegister<ClientInput>;
}>;

export function ClientSequenceFields({
  errors,
  invoiceReadOnly,
  register,
}: ClientSequenceFieldsProps) {
  return (
    <fieldset className="settings-fieldset">
      <legend>Invoice sequence</legend>
      <p className="fieldset-help">
        {invoiceReadOnly
          ? "The invoice prefix and next number change only when an invoice is issued."
          : "The next number changes only when an invoice is issued."}
      </p>
      <div className="sequence-fields">
        <FormField
          error={errors.invoicePrefix?.message}
          label="Invoice prefix"
          readOnly={invoiceReadOnly}
          registration={register("invoicePrefix")}
        />
        <FormField
          error={errors.nextInvoiceNumber?.message}
          inputMode="numeric"
          label="Next invoice number"
          readOnly={invoiceReadOnly}
          registration={register("nextInvoiceNumber")}
        />
      </div>
    </fieldset>
  );
}
