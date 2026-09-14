import type { CreditNote } from "../../../domain/invoices/credit-note.ts";
import { formatCurrencyAmount } from "../../../domain/money/decimal.ts";
import { formatSterlingVatSummary } from "../../../documents/exchange-presentation.ts";
import { InvoiceVatFacts } from "../../ui/invoice-vat-facts.tsx";
import { RetainedDocumentActions } from "./retained-document-actions.tsx";

type CreditNoteHistoryItemProps = Readonly<{ creditNote: CreditNote }>;

export function CreditNoteHistoryItem({ creditNote }: CreditNoteHistoryItemProps) {
  const formatAmount = (amount: string) =>
    formatCurrencyAmount(amount, creditNote.currency.code, creditNote.currency.minorUnit);
  const { vatTreatment } = creditNote.taxFacts;
  const sterlingVatDetails = formatSterlingVatSummary(
    creditNote.taxFacts.kind === "foreign-currency-uk-vat"
      ? creditNote.taxFacts.sterlingVatSummary
      : null,
    creditNote.currency.code,
  );

  return (
    <article
      aria-label={`Credit note ${creditNote.id}`}
      className="invoice-history-item credit-note-history-item"
    >
      <header>
        <div>
          <p className="eyebrow">Full credit note</p>
          <h2>{creditNote.id}</h2>
        </div>
        <strong>{formatAmount(creditNote.totals.gross)}</strong>
      </header>
      <dl className="invoice-history-facts">
        <div>
          <dt>Original invoice</dt>
          <dd>{creditNote.originalInvoiceId}</dd>
        </div>
        <div>
          <dt>Client</dt>
          <dd>{creditNote.client.legalName}</dd>
        </div>
        <div>
          <dt>Issue date</dt>
          <dd>{creditNote.issue.date}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{creditNote.reason}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>{formatAmount(creditNote.totals.net)}</dd>
        </div>
        <div>
          <dt>VAT</dt>
          <dd>{formatAmount(creditNote.totals.vat)}</dd>
        </div>
        <div>
          <dt>Gross</dt>
          <dd>{formatAmount(creditNote.totals.gross)}</dd>
        </div>
        <InvoiceVatFacts
          sterlingVatDetails={sterlingVatDetails}
          taxPoint={vatTreatment.kind === "uk-taxable" ? vatTreatment.taxPoint : null}
          vatWording={vatTreatment.wording}
        />
      </dl>
      <RetainedDocumentActions documentId={creditNote.id} />
    </article>
  );
}
