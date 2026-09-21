import type { CreditNote } from "../../../domain/invoices/credit-note.ts";
import type { IssuedInvoice } from "../../../domain/invoices/issued-invoice.ts";
import { summarizeServiceLines } from "../../../domain/invoices/invoice-service-line.ts";
import { formatCurrencyAmount } from "../../../domain/money/decimal.ts";
import { formatSterlingVatSummary } from "../../../documents/exchange-presentation.ts";
import { InvoiceVatFacts } from "../../ui/invoice-vat-facts.tsx";
import { formatVatTreatment } from "../../ui/vat-treatment-presentation.ts";
import { RetainedDocumentActions } from "./retained-document-actions.tsx";

type InvoiceHistoryItemProps = Readonly<{
  creditNote: CreditNote | null;
  invoice: IssuedInvoice;
  onCorrect: () => void;
}>;

export function InvoiceHistoryItem({ creditNote, invoice, onCorrect }: InvoiceHistoryItemProps) {
  const formatAmount = (amount: string) =>
    formatCurrencyAmount(amount, invoice.currency.code, invoice.currency.minorUnit);
  const total = formatAmount(invoice.totals.gross);
  const { vatTreatment } = invoice.taxFacts;
  const sterlingVatDetails = formatSterlingVatSummary(
    invoice.taxFacts.kind === "foreign-currency-uk-vat"
      ? invoice.taxFacts.sterlingVatSummary
      : null,
    invoice.currency.code,
  );
  const { periodEnd, periodStart, vatRates } = summarizeServiceLines(invoice.serviceLines);

  return (
    <article aria-label={`Invoice ${invoice.id}`} className="invoice-history-item">
      <header>
        <div>
          <p className="eyebrow">Issued invoice{creditNote ? " · Fully credited" : ""}</p>
          <h2>{invoice.id}</h2>
        </div>
        <strong>{total}</strong>
      </header>
      <dl className="invoice-history-facts">
        <div>
          <dt>Issuer</dt>
          <dd>{invoice.issuer.legalName}</dd>
        </div>
        <div>
          <dt>Client</dt>
          <dd>{invoice.client.legalName}</dd>
        </div>
        <div>
          <dt>Issue date</dt>
          <dd>{invoice.issue.date}</dd>
        </div>
        <div>
          <dt>Service period</dt>
          <dd>
            {periodStart} to {periodEnd} · {invoice.serviceLines.length} item
            {invoice.serviceLines.length === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>{formatAmount(invoice.totals.net)}</dd>
        </div>
        <div>
          <dt>VAT</dt>
          <dd>{formatAmount(invoice.totals.vat)}</dd>
        </div>
        <div>
          <dt>Gross</dt>
          <dd>{formatAmount(invoice.totals.gross)}</dd>
        </div>
        <div>
          <dt>VAT treatment</dt>
          <dd>{formatVatTreatment(vatTreatment.kind === "uk-taxable", vatRates)}</dd>
        </div>
        <InvoiceVatFacts
          sterlingVatDetails={sterlingVatDetails}
          taxPoint={vatTreatment.kind === "uk-taxable" ? vatTreatment.taxPoint : null}
          vatWording={vatTreatment.wording}
        />
      </dl>
      <div className="invoice-history-command-row">
        <RetainedDocumentActions documentId={invoice.id} />
        <button className="secondary-action" onClick={onCorrect} type="button">
          {creditNote ? `View chain for ${invoice.id}` : `Correct ${invoice.id}`}
        </button>
      </div>
    </article>
  );
}
