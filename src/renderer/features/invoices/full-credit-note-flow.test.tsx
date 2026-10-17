import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { reviewFullCreditNote } from "../../../domain/invoices/credit-note.js";
import { persistedClientSchema } from "../../../domain/clients/client.js";
import { createReplacementDraft } from "../../../domain/invoices/replacement.js";
import { persistedInvoiceDraftSchema } from "../../../domain/invoices/invoice-draft.js";
import { completeClient } from "../../../../tests/fixtures/client.js";
import {
  completeCreditNote,
  completeInvoiceDraftInput,
  completeIssuedInvoice,
} from "../../../../tests/fixtures/issued-invoice.js";
import { completeIssuer } from "../../../../tests/fixtures/issuer-settings.js";
import {
  businessDate,
  renderAppForTest,
  testInvoiceAppCommands,
} from "../../app/app-test-support.js";
import App from "../../app/app.js";

describe("full credit note flow", () => {
  afterEach(cleanup);

  it("keeps credit-note review unavailable until the generated PDF is rendered", async () => {
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            creditNotes: [],
            currentBusinessDate: businessDate,
            draft: null,
            issuedInvoices: [completeIssuedInvoice],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("button", { name: "Invoices" }));
    const original = screen.getByRole("article", { name: "Invoice GGIOHK-0043" });
    await user.click(within(original).getByRole("button", { name: "Correct GGIOHK-0043" }));
    await user.type(
      screen.getByLabelText("Correction reason"),
      "The billed service period was incorrect.",
    );

    const reviewButton = screen.getByRole("button", { name: "Review and issue credit note" });
    expect(reviewButton).toBeDisabled();
    expect(screen.getByText("Preparing generated PDF…")).toBeVisible();

    await waitFor(() => expect(reviewButton).toBeEnabled());
    expect(screen.getByLabelText("Correction reason")).toHaveValue(
      "The billed service period was incorrect.",
    );
  });

  it("reviews, cancels, and then issues one full credit without changing the original", async () => {
    const issueInputs: Array<Readonly<{ id: string; issueDate: string; reason: string }>> = [];
    const review = reviewFullCreditNote({
      input: {
        issueDate: businessDate,
        originalInvoiceId: completeIssuedInvoice.id,
        reason: "The billed service period was incorrect.",
      },
      invoice: completeIssuedInvoice,
      today: businessDate,
    });
    if (review.kind !== "ready") throw new Error("Expected a ready credit-note fixture");
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      issueFullCreditNote: (input) => {
        issueInputs.push({
          id: input.candidate.id,
          issueDate: input.candidate.issueDate,
          reason: input.candidate.reason,
        });
        return Promise.resolve({
          creditNote: completeCreditNote,
          kind: "issued",
        });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            creditNotes: [],
            currentBusinessDate: businessDate,
            draft: null,
            issuedInvoices: [completeIssuedInvoice],
            issuer: completeIssuer,
          },
        }),
      reviewFullCreditNote: () => Promise.resolve({ kind: "ready", candidate: review.candidate }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("button", { name: "Invoices" }));
    const original = screen.getByRole("article", { name: "Invoice GGIOHK-0043" });
    await user.click(within(original).getByRole("button", { name: "Correct GGIOHK-0043" }));

    expect(screen.getByRole("heading", { name: "Reverse the issued invoice" })).toBeVisible();
    expect(screen.getByText("Bad debt is not a correction reason.")).toBeVisible();
    expect(screen.getByLabelText("Credit-note issue date")).toHaveValue("2026-09-04");
    await user.type(
      screen.getByLabelText("Correction reason"),
      "The billed service period was incorrect.",
    );
    await screen.findByLabelText("Rendered PDF pages");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review and issue credit note" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Review and issue credit note" }));
    let dialog = screen.getByRole("dialog", { name: "Issue credit note CN-GGIOHK-0043?" });
    expect(dialog).toHaveTextContent("GGIOHK-0043");
    expect(dialog).toHaveTextContent("USD -2,900.00");
    expect(dialog).toHaveTextContent("The billed service period was incorrect.");
    expect(dialog).toHaveTextContent("cannot be edited or deleted");
    await user.click(within(dialog).getByRole("button", { name: "Keep reviewing" }));
    expect(issueInputs).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Review and issue credit note" }));
    dialog = screen.getByRole("dialog", { name: "Issue credit note CN-GGIOHK-0043?" });
    await user.clear(screen.getByLabelText("Correction reason"));
    await user.type(screen.getByLabelText("Correction reason"), "Changed after review.");
    await user.clear(screen.getByLabelText("Credit-note issue date"));
    await user.type(screen.getByLabelText("Credit-note issue date"), "2026-09-05");
    await user.click(within(dialog).getByRole("button", { name: "Issue CN-GGIOHK-0043" }));

    expect(issueInputs).toEqual([
      {
        id: "CN-GGIOHK-0043",
        issueDate: "2026-09-04",
        reason: "The billed service period was incorrect.",
      },
    ]);
    expect(await screen.findByText("The original is fully credited.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create replacement" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("article", { name: "Invoice GGIOHK-0043" })).toHaveTextContent(
      "Fully credited",
    );
    expect(screen.queryByRole("button", { name: "Correct GGIOHK-0043" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Credit note CN-GGIOHK-0043" })).toHaveTextContent(
      "USD -2,900.00",
    );
  });

  it("opens a saved unnumbered replacement with the current issue defaults made clear", async () => {
    const currentClient = persistedClientSchema.parse({
      ...completeClient,
      invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
    });
    const replacement = createReplacementDraft({
      client: currentClient,
      creditNote: completeCreditNote,
      invoice: completeIssuedInvoice,
    });
    const requestedOriginals: string[] = [];
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      createReplacementDraft: (originalInvoiceId) => {
        requestedOriginals.push(originalInvoiceId);
        return Promise.resolve({ kind: "created", ...replacement });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [currentClient],
            creditNotes: [completeCreditNote],
            currentBusinessDate: businessDate,
            draft: null,
            issuedInvoices: [completeIssuedInvoice],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("button", { name: "Invoices" }));
    await user.click(screen.getByRole("button", { name: "View chain for GGIOHK-0043" }));
    await user.click(screen.getByRole("button", { name: "Create replacement" }));

    expect(await screen.findByText("Replacement for GGIOHK-0043")).toBeVisible();
    expect(screen.getByText("Current issuer: Codernetic Ltd")).toBeVisible();
    expect(screen.getByText("Current client: Genesis Global")).toBeVisible();
    expect(screen.getByText("Next invoice if issued: GGIOHK-0044")).toBeVisible();
    expect(screen.getByLabelText("Issue date")).toHaveValue("");
    expect(requestedOriginals).toEqual(["GGIOHK-0043"]);
  });

  it("keeps an existing draft until the user atomically replaces it", async () => {
    const existingDraft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const replacement = createReplacementDraft({
      client: completeClient,
      creditNote: completeCreditNote,
      invoice: completeIssuedInvoice,
    });
    let createAttempts = 0;
    let replacementAttempts = 0;
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      createReplacementDraft: () => {
        createAttempts += 1;
        return Promise.resolve({
          kind: "conflict",
          message: "Keep or discard the current invoice draft before creating a replacement.",
        });
      },
      replaceDraftWithReplacement: () => {
        replacementAttempts += 1;
        return Promise.resolve({ kind: "created", ...replacement });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            creditNotes: [completeCreditNote],
            currentBusinessDate: businessDate,
            draft: { kind: "ordinary", draft: existingDraft },
            issuedInvoices: [completeIssuedInvoice],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("button", { name: "Invoices" }));
    await user.click(screen.getByRole("button", { name: "View chain for GGIOHK-0043" }));
    await user.click(screen.getByRole("button", { name: "Create replacement" }));

    expect(await screen.findByRole("button", { name: "Keep current draft" })).toBeVisible();
    expect(replacementAttempts).toBe(0);
    await user.click(
      screen.getByRole("button", { name: "Discard current draft and create replacement" }),
    );

    expect(await screen.findByText("Replacement for GGIOHK-0043")).toBeVisible();
    expect(createAttempts).toBe(1);
    expect(replacementAttempts).toBe(1);
  });
});
