import type { CreditNote, CreditNoteId } from "./credit-note.ts";
import { parseCreditNoteId } from "./credit-note.ts";
import type { InvoiceId, IssuedInvoice } from "./issued-invoice.ts";
import { parseInvoiceId } from "./issued-invoice.ts";

export type DocumentId = InvoiceId | CreditNoteId;

export type RetainedDocument =
  | Readonly<{ kind: "issued-invoice"; record: IssuedInvoice }>
  | Readonly<{ kind: "credit-note"; record: CreditNote }>;

type UntrustedDocumentId = Parameters<typeof parseCreditNoteId>[0];

export function parseDocumentId(value: UntrustedDocumentId): DocumentId {
  try {
    return parseCreditNoteId(value);
  } catch {
    return parseInvoiceId(value);
  }
}
