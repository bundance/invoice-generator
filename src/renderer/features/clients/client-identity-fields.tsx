import type { FieldErrors, UseFormRegister } from "react-hook-form";

import type { ClientInput } from "../../../domain/clients/client.ts";
import { FormField } from "../../ui/form-controls.tsx";

type ClientIdentityFieldsProps = Readonly<{
  errors: FieldErrors<ClientInput>;
  readOnly: boolean;
  register: UseFormRegister<ClientInput>;
}>;

export function ClientIdentityFields({ errors, readOnly, register }: ClientIdentityFieldsProps) {
  return (
    <fieldset className="settings-fieldset">
      <legend>Identity and address</legend>
      <div className="settings-fields">
        <FormField
          error={errors.legalName?.message}
          label="Legal name"
          readOnly={readOnly}
          registration={register("legalName")}
          wide
        />
        <FormField
          error={errors.postalAddress?.message}
          label="Postal address"
          multiline
          readOnly={readOnly}
          registration={register("postalAddress")}
        />
      </div>
    </fieldset>
  );
}
