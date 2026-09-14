import type { InvoiceDraftFieldName } from "../../../domain/invoices/invoice-draft.ts";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";

export type InvoiceDraftFieldGroupProps = Readonly<{
  draftForm: InvoiceDraftForm;
  errorFor: (fieldName: InvoiceDraftFieldName) => string | undefined;
  onFieldBlur: (fieldName: InvoiceDraftFieldName) => void;
}>;
