import type { FullCreditNoteInput } from "../../../domain/invoices/credit-note.ts";
import { reviewFullCreditNote } from "../../../domain/invoices/credit-note.ts";
import type { IssuedInvoice } from "../../../domain/invoices/issued-invoice.ts";
import type { BusinessDate } from "../../../domain/time/business-date.ts";
import { CreditNotePreview } from "./credit-note-preview.tsx";
import { FullCreditNoteDialog } from "./full-credit-note-dialog.tsx";
import { RetainedDocumentActions } from "./retained-document-actions.tsx";
import type { useFullCreditNoteIssue } from "./use-full-credit-note-issue.ts";

type FullCreditNoteEditorProps = Readonly<{
  creditNoteIssue: ReturnType<typeof useFullCreditNoteIssue>;
  currentBusinessDate: BusinessDate;
  input: FullCreditNoteInput;
  invoice: IssuedInvoice;
  onBack: () => void;
  onIssueDateChange: (issueDate: string) => void;
  onReasonChange: (reason: string) => void;
}>;

export function FullCreditNoteEditor({
  creditNoteIssue,
  currentBusinessDate,
  input,
  invoice,
  onBack,
  onIssueDateChange,
  onReasonChange,
}: FullCreditNoteEditorProps) {
  const previewReview = reviewFullCreditNote({ input, invoice, today: currentBusinessDate });
  return (
    <section className="full-credit-note-flow" aria-labelledby="full-credit-note-heading">
      <header className="credit-note-flow-heading">
        <div>
          <p className="eyebrow">Step 1 of 3 · Credit the original</p>
          <h1 id="full-credit-note-heading">Reverse the issued invoice</h1>
          <p>{invoice.id} and its retained PDF will not change.</p>
        </div>
        <button className="secondary-action" onClick={onBack} type="button">
          Back to invoices
        </button>
      </header>
      <div className="credit-note-flow-grid">
        <div className="credit-note-controls">
          <article aria-label={`Original invoice ${invoice.id}`} className="credit-note-original">
            <p className="eyebrow">Original invoice · Issued and unchanged</p>
            <h2>{invoice.id}</h2>
            <p>{invoice.client.legalName}</p>
            <RetainedDocumentActions documentId={invoice.id} />
          </article>
          <label className="field" htmlFor="credit-note-reason">
            <span>Correction reason</span>
            <textarea
              aria-label="Correction reason"
              id="credit-note-reason"
              onChange={(event) => onReasonChange(event.target.value)}
              rows={4}
              value={input.reason}
            />
            <small>Bad debt is not a correction reason.</small>
          </label>
          <label className="field" htmlFor="credit-note-issue-date">
            <span>Credit-note issue date</span>
            <input
              id="credit-note-issue-date"
              max={currentBusinessDate}
              min={invoice.issue.date}
              onChange={(event) => onIssueDateChange(event.target.value)}
              type="date"
              value={input.issueDate}
            />
          </label>
          <p className="validation-warning">
            This reverses the whole invoice. Partial credits are not supported.
          </p>
          {creditNoteIssue.feedback ? (
            <p aria-live="polite" className="validation-summary">
              {creditNoteIssue.feedback}
            </p>
          ) : null}
          <button
            className="primary-action"
            disabled={creditNoteIssue.isReviewing || previewReview.kind !== "ready"}
            onClick={creditNoteIssue.prepareReview}
            type="button"
          >
            {creditNoteIssue.isReviewing ? "Preparing review…" : "Review and issue credit note"}
          </button>
        </div>
        {previewReview.kind === "ready" ? (
          <CreditNotePreview candidate={previewReview.candidate} />
        ) : (
          <section className="preview-panel credit-note-preview-empty">
            Enter the correction reason and a valid date to preview the credit note.
          </section>
        )}
      </div>
      {creditNoteIssue.review ? (
        <FullCreditNoteDialog
          candidate={creditNoteIssue.review.candidate}
          isIssuing={creditNoteIssue.isIssuing}
          onCancel={creditNoteIssue.cancelReview}
          onIssue={creditNoteIssue.issueCreditNote}
        />
      ) : null}
    </section>
  );
}
