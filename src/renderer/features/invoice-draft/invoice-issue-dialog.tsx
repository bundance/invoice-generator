import { useRef, useState } from "react";

import type { InvoiceIssueReviewResult } from "../../../application/invoice-application-contract.ts";
import { formatCurrencyAmount } from "../../../domain/money/decimal.ts";
import { formatSterlingVatSummary } from "../../../documents/exchange-presentation.ts";
import { InvoiceVatFacts } from "../../ui/invoice-vat-facts.tsx";
import { ModalDialog } from "../../ui/modal-dialog.tsx";

type ReadyIssueReview = Extract<InvoiceIssueReviewResult, { kind: "ready" }>;

type InvoiceIssueDialogProps = Readonly<{
  isIssuing: boolean;
  onCancel: () => void;
  onIssue: (lateIssueDateAcknowledged: boolean) => void;
  review: ReadyIssueReview;
}>;

export function InvoiceIssueDialog({
  isIssuing,
  onCancel,
  onIssue,
  review,
}: InvoiceIssueDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [lateIssueDateAcknowledged, setLateIssueDateAcknowledged] = useState(false);
  const { candidate, warnings } = review;
  const warningNeedsAcknowledgement = warnings.some(({ kind }) => kind === "late-issue-date");
  const formatAmount = (amount: string) =>
    formatCurrencyAmount(amount, candidate.currency.code, candidate.currency.minorUnit);
  const { vatTreatment } = candidate.taxFacts;
  const sterlingVatDetails = formatSterlingVatSummary(
    candidate.taxFacts.kind === "foreign-currency-uk-vat"
      ? candidate.taxFacts.sterlingVatSummary
      : null,
    candidate.currency.code,
  );
  const periodStart = candidate.serviceLines.reduce(
    (earliest, line) => (line.periodStart < earliest ? line.periodStart : earliest),
    candidate.serviceLines[0].periodStart,
  );
  const periodEnd = candidate.serviceLines.reduce(
    (latest, line) => (line.periodEnd > latest ? line.periodEnd : latest),
    candidate.serviceLines[0].periodEnd,
  );
  const vatRates = [
    ...new Set(candidate.serviceLines.flatMap((line) => ("vatRate" in line ? [line.vatRate] : []))),
  ];

  return (
    <ModalDialog
      initialFocus={cancelButton}
      labelledBy="invoice-issue-heading"
      onCancel={() => {
        if (!isIssuing) onCancel();
      }}
    >
      <p className="eyebrow">Final issue review</p>
      <h2 id="invoice-issue-heading">Issue invoice {candidate.proposedInvoiceId}?</h2>
      <dl className="issue-facts">
        <div>
          <dt>Issuer</dt>
          <dd>{candidate.issuer.legalName}</dd>
        </div>
        <div>
          <dt>Client</dt>
          <dd>{candidate.client.legalName}</dd>
        </div>
        <div>
          <dt>Service period</dt>
          <dd>
            {periodStart} to {periodEnd} · {candidate.serviceLines.length} item
            {candidate.serviceLines.length === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt>Issue date</dt>
          <dd>{candidate.issueDate}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>{formatAmount(candidate.totals.net)}</dd>
        </div>
        <div>
          <dt>VAT</dt>
          <dd>{formatAmount(candidate.totals.vat)}</dd>
        </div>
        <div>
          <dt>Gross</dt>
          <dd>{formatAmount(candidate.totals.gross)}</dd>
        </div>
        <div>
          <dt>VAT treatment</dt>
          <dd>
            {vatTreatment.kind === "uk-taxable" ? "UK taxable" : "Outside the scope of UK VAT"}
          </dd>
        </div>
        {vatTreatment.kind === "uk-taxable" ? (
          <div>
            <dt>VAT rates</dt>
            <dd>{vatRates.map((rate) => `${rate}%`).join(", ")}</dd>
          </div>
        ) : null}
        <InvoiceVatFacts
          sterlingVatDetails={sterlingVatDetails}
          taxPoint={vatTreatment.kind === "uk-taxable" ? vatTreatment.taxPoint : null}
          vatWording={vatTreatment.wording}
        />
      </dl>
      {warnings.map((warning) => (
        <p className="validation-warning" key={warning.kind}>
          {warning.message}
        </p>
      ))}
      {warningNeedsAcknowledgement ? (
        <label className="issue-warning-check">
          <input
            checked={lateIssueDateAcknowledged}
            onChange={(event) => setLateIssueDateAcknowledged(event.target.checked)}
            type="checkbox"
          />
          I checked the tax point for this late issue date.
        </label>
      ) : null}
      <p className="issue-effect">
        Issuing uses this number permanently. The invoice and retained PDF cannot be edited or
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
          Keep editing
        </button>
        <button
          className="primary-action"
          disabled={isIssuing || (warningNeedsAcknowledgement && !lateIssueDateAcknowledged)}
          onClick={() => onIssue(lateIssueDateAcknowledged)}
          type="button"
        >
          {isIssuing ? "Issuing…" : `Issue ${candidate.proposedInvoiceId}`}
        </button>
      </div>
    </ModalDialog>
  );
}
