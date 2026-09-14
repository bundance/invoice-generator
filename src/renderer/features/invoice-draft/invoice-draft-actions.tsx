import type { Client } from "../../../domain/clients/client.ts";
import { formatDocumentId } from "../../../domain/clients/client.ts";
import type { RefObject } from "react";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";

type InvoiceDraftActionsProps = Readonly<{
  draftForm: InvoiceDraftForm;
  onDiscard: () => void;
  reviewInProgress: boolean;
  selectedClient: Client | undefined;
  trigger: RefObject<HTMLButtonElement | null>;
}>;

export function InvoiceDraftActions({
  draftForm,
  onDiscard,
  reviewInProgress,
  selectedClient,
  trigger,
}: InvoiceDraftActionsProps) {
  return (
    <>
      <div className="draft-actions">
        <button className="secondary-action" onClick={onDiscard} type="button">
          Discard draft
        </button>
        <button className="primary-action" disabled={reviewInProgress} ref={trigger} type="submit">
          {reviewInProgress ? "Reviewing…" : "Review and issue"}
        </button>
      </div>
      <p className="issue-help">
        Reviewing validates this draft. Only the final issue action can consume{" "}
        {proposedInvoiceId(selectedClient)}.
      </p>
      {draftForm.saveStatus === "error" ? (
        <div className="draft-save-error">
          <p>Could not save draft. Your edits are still here.</p>
          <button className="secondary-action" onClick={draftForm.retry} type="button">
            Retry
          </button>
        </div>
      ) : null}
    </>
  );
}

function proposedInvoiceId(client: Client | undefined): string {
  return client
    ? formatDocumentId(client.invoiceSequence.prefix, client.invoiceSequence.nextNumber)
    : "an invoice number";
}
