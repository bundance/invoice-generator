import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../../../domain/clients/client.ts";
import {
  type InvoiceDraftInput,
  persistedInvoiceDraftSchema,
  reviewInvoiceDraft,
} from "../../../domain/invoices/invoice-draft.ts";
import { parseBusinessDate } from "../../../domain/time/business-date.ts";
import { completeGbpVatClient } from "../../../../tests/fixtures/client.ts";
import {
  completeGbpVatInvoiceDraftInput,
  completeGbpVatIssuedInvoice,
} from "../../../../tests/fixtures/issued-invoice.ts";
import { completeIssuer } from "../../../../tests/fixtures/issuer-settings.ts";
import App from "../../app/app.tsx";
import {
  renderAppForTest,
  replaceField,
  testInvoiceAppCommands,
} from "../../app/app-test-support.ts";

describe("GBP UK VAT invoice flow", () => {
  afterEach(cleanup);

  it("keeps the draft, confirmation, issued invoice, and history VAT facts in agreement", async () => {
    let issuedDraft: InvoiceDraftInput = completeGbpVatInvoiceDraftInput;
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      issueInvoice: (input) => {
        issuedDraft = input.draft;
        return Promise.resolve({
          kind: "issued",
          client: persistedClientSchema.parse({
            ...completeGbpVatClient,
            invoiceSequence: { ...completeGbpVatClient.invoiceSequence, nextNumber: "9" },
          }),
          invoice: completeGbpVatIssuedInvoice,
        });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeGbpVatClient],
            currentBusinessDate: parseBusinessDate("2026-09-06"),
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      reviewInvoiceIssue: (draft) => {
        const review = reviewInvoiceDraft({
          client: completeGbpVatClient,
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
    expect(screen.getByText("UK taxable")).toBeVisible();
    expect(screen.getByLabelText("VAT rate")).toHaveValue("20");
    await replaceField(user, "Issue date", "2026-09-06");
    expect(screen.getByLabelText("Tax point")).toHaveValue("2026-09-06");
    await replaceField(user, "Tax point", "2026-09-05");

    await screen.findByLabelText("Rendered PDF pages");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review and issue" })).toBeEnabled(),
    );

    await user.click(screen.getByRole("button", { name: "Review and issue" }));
    const dialog = await screen.findByRole("dialog", { name: "Issue invoice ACME-0008?" });
    expect(within(dialog).getByText("Codernetic Ltd")).toBeVisible();
    expect(within(dialog).getByText("20%")).toBeVisible();
    expect(within(dialog).getByText("2026-09-05")).toBeVisible();
    expect(within(dialog).getByText("£2,900.00")).toBeVisible();
    expect(within(dialog).getByText("£580.00")).toBeVisible();
    expect(within(dialog).getByText("£3,480.00")).toBeVisible();
    expect(within(dialog).getByText("UK VAT applies.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Issue ACME-0008" }));

    const history = await screen.findByRole("article", { name: "Invoice ACME-0008" });
    expect(history).toHaveTextContent("£2,900.00");
    expect(history).toHaveTextContent("£580.00");
    expect(history).toHaveTextContent("£3,480.00");
    expect(history).toHaveTextContent("Codernetic Ltd");
    expect(history).toHaveTextContent("UK VAT at 20%");
    expect(history).toHaveTextContent("UK VAT applies.");
    expect(history).toHaveTextContent("Tax point2026-09-05");
    await waitFor(() => expect(ukTaxPoint(issuedDraft)).toBe("2026-09-05"));
  });
});

function ukTaxPoint(draft: InvoiceDraftInput): string {
  if (draft.vatTreatment !== "uk-taxable") throw new Error("Expected a UK-taxable draft");
  return draft.taxPoint;
}
