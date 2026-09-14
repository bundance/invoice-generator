import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import {
  completeForeignCurrencyVatCreditNote,
  completeForeignCurrencyVatIssuedInvoice,
  completeIssuedInvoice,
} from "../../tests/fixtures/issued-invoice.js";
import { persistedIssuedInvoiceSchema } from "../domain/invoices/issued-invoice.js";
import { BillingDocument } from "./invoice-document.js";
import {
  createCreditNoteDocumentModel,
  createIssuedInvoiceDocumentModel,
} from "./invoice-document-model.js";

describe("billing document", () => {
  it("carries its bundled document font into every rendering context", () => {
    const { container, unmount } = render(
      <BillingDocument model={createIssuedInvoiceDocumentModel(completeIssuedInvoice)} />,
    );

    const fontStyle = container.querySelector("style[data-billing-document-fonts]");
    expect(fontStyle).toHaveTextContent('@font-face{font-family:"Arimo"');
    expect(fontStyle).toHaveTextContent("U+0370-0377");
    expect(fontStyle).toHaveTextContent("U+0400-045F");
    expect(fontStyle).toHaveTextContent("U+0590-05FF");
    expect(fontStyle).toHaveTextContent("U+1EA0-1EF9");
    expect(fontStyle).toHaveTextContent("font-weight:400");
    expect(fontStyle).toHaveTextContent("font-weight:700");
    unmount();
  });

  it("renders an issued invoice from its immutable snapshot", () => {
    render(<BillingDocument model={createIssuedInvoiceDocumentModel(completeIssuedInvoice)} />);

    const invoice = screen.getByRole("article", { name: "Invoice GGIOHK-0043" });
    expect(within(invoice).getByRole("heading", { name: "INVOICE GGIOHK-0043" })).toBeVisible();
    expect(invoice).toHaveTextContent("Genesis Global");
    expect(within(invoice).getAllByText("USD 2,900.00")).not.toHaveLength(0);
    expect(
      within(invoice).getByText(
        "Outside the scope of UK VAT. Subject to reverse charge in the country of receipt.",
      ),
    ).toBeVisible();
  });

  it("renders the statutory sterling VAT summary from its immutable snapshot", () => {
    if (completeForeignCurrencyVatIssuedInvoice.taxFacts.kind !== "foreign-currency-uk-vat") {
      throw new Error("Expected foreign-currency VAT evidence");
    }
    const { taxFacts } = completeForeignCurrencyVatIssuedInvoice;
    const evidenceReference = "HMRC monthly exchange rates\nSeptember 2026";
    const invoiceWithMultilineEvidence = persistedIssuedInvoiceSchema.parse({
      ...completeForeignCurrencyVatIssuedInvoice,
      taxFacts: {
        ...taxFacts,
        sterlingVatSummary: {
          ...taxFacts.sterlingVatSummary,
          exchangeRecord: {
            ...taxFacts.sterlingVatSummary.exchangeRecord,
            evidenceReference,
          },
        },
      },
    });
    render(
      <BillingDocument model={createIssuedInvoiceDocumentModel(invoiceWithMultilineEvidence)} />,
    );

    const invoice = screen.getByRole("article", { name: "Invoice USDVAT-0012" });
    expect(invoice).toHaveTextContent("VAT amounts in sterling");
    expect(invoice).toHaveTextContent("GBP 2,320.00");
    expect(invoice).toHaveTextContent("GBP 464.00");
    expect(invoice).toHaveTextContent("1 GBP = 1.25 USD");
    expect(invoice).toHaveTextContent("HMRC period rate");
    const evidence = within(invoice).getByText(
      (_, element) => element?.textContent === `Evidence: ${evidenceReference}`,
    );
    expect(evidence).toHaveClass("document-sterling-vat__evidence");
  });

  it("renders a linked full credit note with exact negative totals and sterling evidence", () => {
    render(
      <BillingDocument
        model={createCreditNoteDocumentModel(completeForeignCurrencyVatCreditNote)}
      />,
    );

    const creditNote = screen.getByRole("article", { name: "Credit note CN-USDVAT-0012" });
    expect(
      within(creditNote).getByRole("heading", { name: "CREDIT NOTE CN-USDVAT-0012" }),
    ).toBeVisible();
    expect(creditNote).toHaveTextContent("References invoice USDVAT-0012, issued 2026-09-06");
    expect(creditNote).toHaveTextContent("The billed service period was incorrect.");
    expect(creditNote).toHaveTextContent("USD -3,480.00");
    expect(creditNote).toHaveTextContent("GBP -2,784.00");
    expect(creditNote).toHaveTextContent("HMRC monthly exchange rates, September 2026");
  });
});
