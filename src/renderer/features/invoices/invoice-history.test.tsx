import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RetainedDocumentActionResult } from "../../../application/invoice-application-contract.js";
import { persistedClientSchema } from "../../../domain/clients/client.js";
import { persistedCreditNoteSchema } from "../../../domain/invoices/credit-note.js";
import { persistedIssuerSettingsSchema } from "../../../domain/issuer/issuer-settings.js";
import { persistedIssuedInvoiceSchema } from "../../../domain/invoices/issued-invoice.js";
import { completeClient } from "../../../../tests/fixtures/client.js";
import {
  completeCreditNote,
  completeIssuedInvoice,
} from "../../../../tests/fixtures/issued-invoice.js";
import { completeIssuer } from "../../../../tests/fixtures/issuer-settings.js";
import { businessDate, unusedInvoiceAppCommands } from "../../app/app-test-support.js";
import App from "../../app/app.js";

describe("invoice history", () => {
  afterEach(cleanup);

  it("shows immutable facts and routes every document action to the retained PDF", async () => {
    const actions: string[] = [];
    const currentClient = persistedClientSchema.parse({
      ...completeClient,
      legalName: "Current client record",
      standardDayRate: "900",
    });
    const currentIssuer = persistedIssuerSettingsSchema.parse({
      ...completeIssuer,
      legalName: "Current issuer settings",
    });
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      exportRetainedDocument: (invoiceId) => {
        actions.push(`export:${invoiceId}`);
        return Promise.resolve({ kind: "completed" });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [currentClient],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [completeIssuedInvoice],
            issuer: currentIssuer,
          },
        }),
      openRetainedDocument: (invoiceId) => {
        actions.push(`open:${invoiceId}`);
        return Promise.resolve({ kind: "completed" });
      },
      printRetainedDocument: (invoiceId) => {
        actions.push(`print:${invoiceId}`);
        return Promise.resolve({ kind: "completed" });
      },
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Invoices" }));
    const record = screen.getByRole("article", { name: "Invoice GGIOHK-0043" });
    expect(record).toHaveTextContent("Genesis Global");
    expect(record).toHaveTextContent("Codernetic Ltd");
    expect(record).not.toHaveTextContent("Current client record");
    expect(record).not.toHaveTextContent("Current issuer settings");
    expect(record).toHaveTextContent("2026-09-04");
    expect(record).toHaveTextContent("USD 2,900.00");
    expect(record).toHaveTextContent("Outside the scope of UK VAT");

    await user.click(within(record).getByRole("button", { name: "Open GGIOHK-0043" }));
    await user.click(within(record).getByRole("button", { name: "Export GGIOHK-0043" }));
    await user.click(within(record).getByRole("button", { name: "Print GGIOHK-0043" }));
    expect(actions).toEqual(["open:GGIOHK-0043", "export:GGIOHK-0043", "print:GGIOHK-0043"]);
  });

  it("retries failed document actions from history without issuing again", async () => {
    const actionCounts = { export: 0, open: 0, print: 0 };
    let issueCount = 0;
    const runAction = (
      action: keyof typeof actionCounts,
    ): Promise<RetainedDocumentActionResult> => {
      actionCounts[action] += 1;
      return Promise.resolve(
        actionCounts[action] === 1
          ? { kind: "failed", message: `Could not ${action} the retained PDF.` }
          : { kind: "completed" },
      );
    };
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      exportRetainedDocument: () => runAction("export"),
      issueInvoice: () => {
        issueCount += 1;
        return Promise.resolve({ kind: "failed", message: "Unexpected issue attempt." });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [completeIssuedInvoice],
            issuer: completeIssuer,
          },
        }),
      openRetainedDocument: () => runAction("open"),
      printRetainedDocument: () => runAction("print"),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Invoices" }));
    const record = screen.getByRole("article", { name: "Invoice GGIOHK-0043" });
    const successMessageByAction = {
      Export: "Exported the retained PDF.",
      Open: "Opened the retained PDF.",
      Print: "Sent the retained PDF to print.",
    };
    const documentActions: readonly (keyof typeof successMessageByAction)[] = [
      "Open",
      "Export",
      "Print",
    ];
    for (const action of documentActions) {
      const button = within(record).getByRole("button", { name: `${action} GGIOHK-0043` });
      await user.click(button);
      await screen.findByText(`Could not ${action.toLowerCase()} the retained PDF.`);
      await user.click(button);
      await screen.findByText(successMessageByAction[action]);
    }

    expect(actionCounts).toEqual({ export: 2, open: 2, print: 2 });
    expect(issueCount).toBe(0);
  });

  it("presents a linked replacement in one correction chain and opens every retained PDF", async () => {
    const replacementInvoice = persistedIssuedInvoiceSchema.parse({
      ...completeIssuedInvoice,
      id: "GGIOHK-0044",
      invoiceNumber: "44",
      replacesInvoiceId: completeIssuedInvoice.id,
      issue: { ...completeIssuedInvoice.issue, timestamp: "2026-09-08T10:11:12.000Z" },
      retainedPdf: { filename: "GGIOHK-0044.pdf", sha256: "f".repeat(64) },
    });
    const secondCreditNote = persistedCreditNoteSchema.parse({
      ...completeCreditNote,
      id: "CN-GGIOHK-0044",
      originalInvoiceId: replacementInvoice.id,
      issue: { ...completeCreditNote.issue, timestamp: "2026-09-08T11:11:12.000Z" },
      retainedPdf: { filename: "CN-GGIOHK-0044.pdf", sha256: "e".repeat(64) },
    });
    const secondReplacement = persistedIssuedInvoiceSchema.parse({
      ...replacementInvoice,
      id: "GGIOHK-0045",
      invoiceNumber: "45",
      replacesInvoiceId: replacementInvoice.id,
      issue: { ...replacementInvoice.issue, timestamp: "2026-09-08T12:11:12.000Z" },
      retainedPdf: { filename: "GGIOHK-0045.pdf", sha256: "d".repeat(64) },
    });
    const openedDocuments: string[] = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [completeCreditNote, secondCreditNote],
            issuedInvoices: [completeIssuedInvoice, replacementInvoice, secondReplacement],
            issuer: completeIssuer,
          },
        }),
      openRetainedDocument: (documentId) => {
        openedDocuments.push(documentId);
        return Promise.resolve({ kind: "completed" });
      },
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Invoices" }));
    const chain = screen.getByRole("region", { name: "Correction chain from GGIOHK-0043" });
    expect(within(chain).getByRole("article", { name: "Invoice GGIOHK-0043" })).toBeVisible();
    expect(
      within(chain).getByRole("article", { name: "Credit note CN-GGIOHK-0043" }),
    ).toBeVisible();
    expect(within(chain).getByRole("article", { name: "Invoice GGIOHK-0044" })).toBeVisible();
    expect(
      within(chain).getByRole("article", { name: "Credit note CN-GGIOHK-0044" }),
    ).toBeVisible();
    expect(within(chain).getByRole("article", { name: "Invoice GGIOHK-0045" })).toBeVisible();

    const chainDocumentIds = [
      "GGIOHK-0043",
      "CN-GGIOHK-0043",
      "GGIOHK-0044",
      "CN-GGIOHK-0044",
      "GGIOHK-0045",
    ];
    for (const documentId of chainDocumentIds) {
      await user.click(within(chain).getByRole("button", { name: `Open ${documentId}` }));
    }
    expect(openedDocuments).toEqual(chainDocumentIds);
  });
});
