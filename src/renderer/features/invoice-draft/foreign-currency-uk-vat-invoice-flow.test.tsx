import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../../../domain/clients/client.ts";
import {
  type InvoiceDraftInput,
  persistedInvoiceDraftSchema,
  reviewInvoiceDraft,
} from "../../../domain/invoices/invoice-draft.ts";
import { persistedIssuedInvoiceSchema } from "../../../domain/invoices/issued-invoice.ts";
import { parseBusinessDate } from "../../../domain/time/business-date.ts";
import { completeForeignCurrencyVatClient } from "../../../../tests/fixtures/client.ts";
import {
  completeForeignCurrencyVatInvoiceDraftInput,
  completeForeignCurrencyVatIssuedInvoice,
} from "../../../../tests/fixtures/issued-invoice.ts";
import { completeIssuer } from "../../../../tests/fixtures/issuer-settings.ts";
import App from "../../app/app.tsx";
import {
  renderAppForTest,
  replaceField,
  testInvoiceAppCommands,
} from "../../app/app-test-support.ts";

describe("foreign-currency UK VAT invoice flow", () => {
  afterEach(cleanup);

  it("resets exchange evidence whenever the draft currency changes", async () => {
    const savedDrafts: InvoiceDraftInput[] = [];
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeForeignCurrencyVatClient],
            currentBusinessDate: parseBusinessDate("2026-09-06"),
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveInvoiceDraft: (draft) => {
        savedDrafts.push(draft);
        return Promise.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) });
      },
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    const currency = await screen.findByRole("combobox", { name: "Currency" });
    await user.selectOptions(currency, "GBP");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    expect(screen.queryByLabelText(/Exchange rate \(/u)).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Client" }));
    await user.selectOptions(currency, "USD");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    expect(screen.getByLabelText("Exchange rate (USD per GBP)")).toHaveValue("");
    await replaceField(user, "Exchange rate (USD per GBP)", "1.25");
    await replaceField(user, "Exchange-rate evidence reference", "USD evidence");

    await user.click(screen.getByRole("tab", { name: "Client" }));
    await user.selectOptions(currency, "KWD");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    expect(screen.getByLabelText("Exchange rate (KWD per GBP)")).toHaveValue("");
    expect(screen.getByLabelText("Exchange-rate evidence reference")).toHaveValue("");
    await waitFor(() => expect(savedDrafts.at(-1)?.currencyCode).toBe("KWD"));
    expect(savedDrafts.at(-1)).toMatchObject({
      exchange: {
        effectiveDate: "",
        evidenceReference: "",
        kind: "required",
        method: "",
        rate: "",
      },
    });
  });

  it("keeps exchange evidence and both currency calculations in agreement", async () => {
    const evidenceReference = "HMRC monthly exchange rates\nSeptember 2026";
    let issuedDraft: InvoiceDraftInput = completeForeignCurrencyVatInvoiceDraftInput;
    if (completeForeignCurrencyVatIssuedInvoice.taxFacts.kind !== "foreign-currency-uk-vat") {
      throw new Error("Expected foreign-currency VAT evidence");
    }
    const { taxFacts } = completeForeignCurrencyVatIssuedInvoice;
    const issuedInvoice = persistedIssuedInvoiceSchema.parse({
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
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      issueInvoice: (input) => {
        issuedDraft = input.draft;
        return Promise.resolve({
          kind: "issued",
          client: persistedClientSchema.parse({
            ...completeForeignCurrencyVatClient,
            invoiceSequence: {
              ...completeForeignCurrencyVatClient.invoiceSequence,
              nextNumber: "13",
            },
          }),
          invoice: issuedInvoice,
        });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeForeignCurrencyVatClient],
            currentBusinessDate: parseBusinessDate("2026-09-06"),
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      reviewInvoiceIssue: (draft) => {
        const review = reviewInvoiceDraft({
          client: completeForeignCurrencyVatClient,
          draft,
          issuer: completeIssuer,
          today: parseBusinessDate("2026-09-06"),
        });
        return Promise.resolve(
          review.candidate
            ? { kind: "ready", candidate: review.candidate, warnings: review.warnings }
            : { kind: "invalid", message: "The draft is invalid." },
        );
      },
      saveInvoiceDraft: (draft) =>
        Promise.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-09-02");
    await replaceField(user, "Period end", "2026-09-05");
    await replaceField(user, "Billable days", "4");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-06");
    await replaceField(user, "Tax point", "2026-09-05");
    await replaceField(user, "Exchange rate (USD per GBP)", "1.25");
    await replaceField(user, "Exchange-rate effective date", "2026-09-05");
    await user.selectOptions(screen.getByLabelText("Exchange-rate method"), "hmrc-period-rate");
    await replaceField(user, "Exchange-rate evidence reference", evidenceReference);

    await screen.findByLabelText("Rendered PDF pages");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review and issue" })).toBeEnabled(),
    );

    await user.click(screen.getByRole("button", { name: "Review and issue" }));
    const dialog = await screen.findByRole("dialog", { name: "Issue invoice USDVAT-0012?" });
    expect(dialog).toHaveTextContent("$3,480.00");
    expect(dialog).toHaveTextContent("£2,784.00");
    expect(dialog).toHaveTextContent("1 GBP = 1.25 USD");
    const dialogEvidence = within(dialog).getByText(
      (_, element) => element?.textContent === evidenceReference,
    );
    expect(dialogEvidence).toHaveClass("sterling-vat-facts__evidence");
    await user.click(within(dialog).getByRole("button", { name: "Issue USDVAT-0012" }));

    const history = await screen.findByRole("article", { name: "Invoice USDVAT-0012" });
    expect(history).toHaveTextContent("$3,480.00");
    expect(history).toHaveTextContent("£2,784.00");
    expect(history).toHaveTextContent("1 GBP = 1.25 USD");
    expect(history).toHaveTextContent("2026-09-05");
    const historyEvidence = within(history).getByText(
      (_, element) => element?.textContent === evidenceReference,
    );
    expect(historyEvidence).toHaveClass("sterling-vat-facts__evidence");
    await waitFor(() => expect(foreignExchangeEvidence(issuedDraft)).toBe(evidenceReference));
  });
});

function foreignExchangeEvidence(draft: InvoiceDraftInput): string {
  if (draft.vatTreatment !== "uk-taxable" || draft.exchange.kind !== "required") {
    throw new Error("Expected a foreign-currency UK-taxable draft");
  }
  return draft.exchange.evidenceReference;
}
