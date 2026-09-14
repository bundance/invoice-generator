import { coderneticWordmarkDataUrl } from "./codernetic-wordmark.ts";
import { billingDocumentFontCss } from "./billing-document-fonts.ts";
import type { BillingDocumentModel } from "./invoice-document-model.ts";

type BillingDocumentProps = Readonly<{ model: BillingDocumentModel }>;

export function BillingDocument({ model }: BillingDocumentProps) {
  const heading = createDocumentHeading(model);
  const isCreditNote = model.kind === "credit-note";
  return (
    <article
      aria-label={heading.ariaLabel}
      className={`invoice-document pdf-page${
        model.sterlingVatSummary ? " invoice-document--sterling-vat" : ""
      }`}
      data-fit-page
    >
      <style data-billing-document-fonts>{billingDocumentFontCss}</style>
      <header className="document-header" data-fit-region="header">
        <img
          alt="Codernetic"
          className="document-logo"
          height={72}
          src={coderneticWordmarkDataUrl}
          width={334}
        />
        <address data-fit-region="issuer-address">
          <strong>{model.issuer.legalName}</strong>
          <br />
          {model.issuer.registeredAddress}
        </address>
      </header>
      <section className="document-meta" data-fit-region="document-meta">
        <div className="document-meta-copy">
          <em>Bacs details:</em>
          <br />
          <span data-fit-region="bank-name">{model.issuer.bankName}</span>
          <br />
          Account Number: {model.issuer.accountNumber}
          <br />
          Sort Code: {formatSortCode(model.issuer.sortCode)}
          <br />
          <br />
          <div className="document-recipient" data-fit-region="client-details">
            <strong>{heading.recipientLabel}</strong>
            <br />
            {model.clientLegalName}
            <br />
            <span className="client-address">{model.clientPostalAddress}</span>
          </div>
        </div>
        <div className="document-title" data-fit-region="document-title">
          <h2 data-fit-region="document-heading">{heading.title}</h2>
          <strong data-fit-region="issue-date">{model.issueDate}</strong>
          {model.kind === "draft-invoice" ? <small>No number has been assigned</small> : null}
          {isCreditNote ? <small>Full credit of {model.originalInvoiceId}</small> : null}
        </div>
      </section>
      {isCreditNote ? (
        <section className="credit-note-link" data-fit-region="original-invoice-reference">
          <span>Credit for {model.clientLegalName}</span>
          <strong>
            References invoice {model.originalInvoiceId}, issued {model.originalIssueDate}
          </strong>
        </section>
      ) : null}
      <table className="document-table" aria-label="Service and totals" data-fit-region="table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Net Cost</th>
            <th>VAT</th>
          </tr>
        </thead>
        <tbody>
          <tr className="service-row">
            <td>
              <div className="service-copy" data-fit-region="service-description">
                {model.serviceDescription}
                <br />
                <br />
                <em>Invoice Period:</em>
                <br />
                <br />
                {model.periodStart} -<br />
                {model.periodEnd}
              </div>
            </td>
            <td className="document-value" data-fit-region="billable-days">
              {model.billableDays}
            </td>
            <td className="document-value" data-fit-region="day-rate">
              {model.dayRate}
            </td>
            <td className="document-value" data-fit-region="line-net">
              {model.net}
            </td>
            <td className="document-value" data-fit-region="line-vat">
              {model.vat}
            </td>
          </tr>
          <tr>
            <td aria-label="Not applicable" />
            <td aria-label="Not applicable" />
            <td className="totals-label">SUBTOTALS</td>
            <td className="document-value" data-fit-region="subtotal-net">
              {model.net}
            </td>
            <td className="document-value" data-fit-region="subtotal-vat">
              {model.vat}
            </td>
          </tr>
          <tr className="total-row">
            <td aria-label="Not applicable" />
            <td aria-label="Not applicable" />
            <td>TOTAL</td>
            <td className="document-value" colSpan={2} data-fit-region="gross-total">
              {model.gross} {model.currencyCode}
            </td>
          </tr>
        </tbody>
      </table>
      {isCreditNote ? (
        <section className="credit-note-reason" data-fit-region="correction-reason">
          <span>Correction reason</span>
          <strong>{model.reason}</strong>
        </section>
      ) : null}
      {model.sterlingVatSummary ? (
        <section className="document-sterling-vat" data-fit-region="sterling-vat">
          <h3>VAT amounts in sterling</h3>
          <dl>
            <div>
              <dt>Net</dt>
              <dd>{model.sterlingVatSummary.net}</dd>
            </div>
            <div>
              <dt>VAT</dt>
              <dd>{model.sterlingVatSummary.vat}</dd>
            </div>
            <div>
              <dt>Gross</dt>
              <dd>{model.sterlingVatSummary.gross}</dd>
            </div>
          </dl>
          <p>
            Exchange rate: {model.sterlingVatSummary.rateStatement} · Effective date:{" "}
            {model.sterlingVatSummary.effectiveDate} · {model.sterlingVatSummary.method}
          </p>
          <p className="document-sterling-vat__evidence">
            Evidence: {model.sterlingVatSummary.evidenceReference}
          </p>
        </section>
      ) : null}
      <section className="document-notes" data-fit-region="notes">
        {model.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        {model.taxPoint && model.vatRate ? (
          <p>
            Tax point: {model.taxPoint} · VAT rate: {model.vatRate}% · {model.vatWording}
          </p>
        ) : (
          <p>{model.vatWording}</p>
        )}
      </section>
      <footer className="document-footer" data-fit-region="footer">
        <span data-fit-region="payment-terms">{model.paymentTerms}</span>
        <br />
        VAT Registration Number {formatVatNumber(model.issuer.vatRegistrationNumber)}
        <br />
        Company Reg. No. {model.issuer.companyNumber}
      </footer>
    </article>
  );
}

type DocumentHeading = Readonly<{
  ariaLabel: string;
  recipientLabel: string;
  title: string;
}>;

function createDocumentHeading(model: BillingDocumentModel): DocumentHeading {
  switch (model.kind) {
    case "draft-invoice":
      return { ariaLabel: "Draft invoice", recipientLabel: "Invoice to:", title: "DRAFT INVOICE" };
    case "issued-invoice":
      return {
        ariaLabel: `Invoice ${model.id}`,
        recipientLabel: "Invoice to:",
        title: `INVOICE ${model.id}`,
      };
    case "credit-note":
      return {
        ariaLabel: `Credit note ${model.id}`,
        recipientLabel: "Credit note to:",
        title: `CREDIT NOTE ${model.id}`,
      };
    default: {
      const unhandledModel: never = model;
      return unhandledModel;
    }
  }
}

function formatSortCode(sortCode: string): string {
  return `${sortCode.slice(0, 2)}-${sortCode.slice(2, 4)}-${sortCode.slice(4)}`;
}

function formatVatNumber(vatNumber: string): string {
  return `${vatNumber.slice(0, 3)} ${vatNumber.slice(3, 7)} ${vatNumber.slice(7)}`;
}
