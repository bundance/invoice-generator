import type { UseFormRegisterReturn } from "react-hook-form";

export type FormSaveStatusKind = "not-saved" | "editing" | "saving" | "saved" | "error";

type FormFieldProps<FieldName extends string> = Readonly<{
  error: string | undefined;
  id?: string;
  idPrefix?: string;
  inputMode?: "decimal" | "numeric";
  label: string;
  multiline?: boolean;
  multilineRows?: number;
  readOnly?: boolean;
  registration: UseFormRegisterReturn<FieldName>;
  type?: "date" | "text";
  wide?: boolean;
}>;

export function FormField<FieldName extends string>({
  error,
  id: explicitId,
  idPrefix,
  inputMode,
  label,
  multiline = false,
  multilineRows = 3,
  readOnly = false,
  registration,
  type = "text",
  wide = false,
}: FormFieldProps<FieldName>) {
  const id = explicitId ?? (idPrefix ? `${idPrefix}-${registration.name}` : registration.name);
  const errorId = `${id}-error`;
  const fieldProps = {
    "aria-describedby": error ? errorId : undefined,
    "aria-invalid": error ? true : undefined,
    id,
    readOnly,
    ...registration,
  };

  return (
    <div className={`settings-field${multiline || wide ? " settings-field--wide" : ""}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea {...fieldProps} rows={multilineRows} />
      ) : (
        <input {...fieldProps} inputMode={inputMode} type={type} />
      )}
      <FormFieldError error={error} id={errorId} />
    </div>
  );
}

export function FormFieldError({
  error,
  id,
}: Readonly<{ error: string | undefined; id?: string }>) {
  return error ? (
    <span className="field-error" id={id}>
      {error}
    </span>
  ) : null;
}

export function FormSaveStatus({
  label,
  status,
}: Readonly<{ label: string | null; status: FormSaveStatusKind }>) {
  if (!label) return null;
  return (
    <output className={`save-status save-status--${status}`}>
      <span aria-hidden="true" />
      {label}
    </output>
  );
}
