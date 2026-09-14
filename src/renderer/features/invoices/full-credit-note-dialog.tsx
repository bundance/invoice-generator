import { useRef } from "react";

import type { FullCreditNoteCandidate } from "../../../domain/invoices/credit-note.ts";
import { formatCurrencyAmount } from "../../../domain/money/decimal.ts";
import { ModalDialog } from "../../ui/modal-dialog.tsx";

type FullCreditNoteDialogProps = Readonly<{
  candidate: FullCreditNoteCandidate;
  isIssuing: boolean;
  onCancel: () => void;
  onIssue: () => void;
}>;

export function FullCreditNoteDialog({
  candidate,
  isIssuing,
  onCancel,
  onIssue,
}: FullCreditNoteDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const gross = formatCurrencyAmount(
    candidate.totals.gross,
    candidate.currency.code,
    candidate.currency.minorUnit,
  );
  const { vatTreatment } = candidate.taxFacts;

  return (
    <ModalDialog
      initialFocus={cancelButton}
      labelledBy="credit-note-issue-heading"
      onCancel={() => {
        if (!isIssuing) onCancel();
      }}
    >
      <p className="eyebrow">Final credit-note review</p>
      <h2 id="credit-note-issue-heading">Issue credit note {candidate.id}?</h2>
      <dl className="issue-facts">
        <div>
          <dt>Original invoice</dt>
          <dd>{candidate.originalInvoiceId}</dd>
        </div>
        <div>
          <dt>Issue date</dt>
          <dd>{candidate.issueDate}</dd>
        </div>
        <div>
          <dt>Full credit</dt>
          <dd>{gross}</dd>
        </div>
        <div>
          <dt>VAT treatment</dt>
          <dd>
            {vatTreatment.kind === "uk-taxable"
              ? `UK VAT at ${vatTreatment.rate}%`
              : "Outside the scope of UK VAT"}
          </dd>
        </div>
        <div>
          <dt>Correction reason</dt>
          <dd>{candidate.reason}</dd>
        </div>
      </dl>
      <p className="issue-effect">
        This fully credits the original. Both documents and their retained PDFs cannot be edited or
        deleted.
      </p>
      <div className="draft-actions">
        <button
          className="secondary-action"
          disabled={isIssuing}
          onClick={onCancel}
          ref={cancelButton}
          type="button"
        >
          Keep reviewing
        </button>
        <button className="primary-action" disabled={isIssuing} onClick={onIssue} type="button">
          {isIssuing ? "Issuing…" : `Issue ${candidate.id}`}
        </button>
      </div>
    </ModalDialog>
  );
}
