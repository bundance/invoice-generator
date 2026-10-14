import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Locator, Page } from "@playwright/test";

import { initialWorkspaceState, type WorkspaceState } from "../../src/application/workspace.js";
import { persistedClientSchema } from "../../src/domain/clients/client.js";
import { persistedInvoiceDraftSchema } from "../../src/domain/invoices/invoice-draft.js";
import { persistedIssuerSettingsSchema } from "../../src/domain/issuer/issuer-settings.js";
import {
  billingDocumentMeasurementsSchema,
  collectBillingDocumentMeasurements,
  evaluateBillingDocumentFit,
} from "../../src/documents/document-fit.js";
import {
  parseWorkspaceState,
  serializeWorkspaceState,
} from "../../src/infrastructure/persistence/workspace-state.js";
import type { FaultPoint } from "../../src/infrastructure/testing/fault-injection.js";
import {
  completeClient,
  completeForeignCurrencyVatClient,
  completeGbpVatClient,
} from "../fixtures/client.js";
import { completeInvoiceDraftInput } from "../fixtures/issued-invoice.js";
import { completeIssuer } from "../fixtures/issuer-settings.js";
import {
  closeApp,
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "./support/electron-test-app.js";
import { verifyRetainedInvoicePdf } from "./support/retained-pdf-verification.js";

const pdfBaselineDirectory = join(import.meta.dirname, "../baselines/pdf");

test("a GBP UK VAT invoice keeps exact tax facts and retained evidence after restart", async ({
  browserName: _browserName,
}, testInfo) => {
  const userDataPath = await createUserDataPath("gbp-uk-vat-invoice");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeGbpVatClient],
      issuer: completeIssuer,
    }),
  );
  let electronApp = await launchProductionApp(userDataPath);

  try {
    let page = await electronApp.firstWindow();
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Period start").fill("2026-09-02");
    await page.getByLabel("Period end").fill("2026-09-05");
    await page.getByLabel("Billable days").fill("4");
    await page.getByRole("tab", { name: "Tax & issue" }).click();
    await expect(page.getByText("UK taxable")).toBeVisible();
    await expect(page.getByLabel("VAT rate")).toHaveValue("20");
    await page.getByLabel("Issue date").fill("2026-09-06");
    await expect(page.getByLabel("Tax point")).toHaveValue("2026-09-06");
    await page.getByLabel("Tax point").fill("2026-09-05");
    await expect(page.getByText("Saved on this Mac")).toBeVisible();

    const preview = page.getByLabel("Invoice preview");
    await expect(preview).toContainText("GBP 2,900.00");
    await expect(preview).toContainText("GBP 580.00");
    await expect(preview).toContainText("GBP 3,480.00");
    await expect(preview.getByRole("row", { name: /20%/u })).toBeVisible();
    await expect(preview).toContainText("Tax point: 2026-09-05");
    await expectPreviewFits(preview);

    await page.getByRole("button", { name: "Review and issue" }).click();
    let dialog = page.getByRole("dialog", { name: "Issue invoice ACME-0008?" });
    await expect(dialog).toContainText("GBP 2,900.00");
    await expect(dialog).toContainText("GBP 580.00");
    await expect(dialog).toContainText("GBP 3,480.00");
    await expect(dialog).toContainText("Codernetic Ltd");
    await expect(dialog).toContainText("UK VAT applies.");
    await expect(dialog).toContainText("20%");
    await expect(dialog).toContainText("2026-09-05");
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    let workspace = await readWorkspaceState(userDataPath);
    expect(workspace.draft).not.toBeNull();
    expect(workspace.clients[0]?.invoiceSequence.nextNumber).toBe("8");
    expect(workspace.issuedInvoices).toHaveLength(0);

    await page.getByRole("button", { name: "Review and issue" }).click();
    dialog = page.getByRole("dialog", { name: "Issue invoice ACME-0008?" });
    await dialog.getByRole("button", { name: "Issue ACME-0008" }).click();

    const invoiceRecord = page.getByRole("article", { name: "Invoice ACME-0008" });
    await expect(invoiceRecord).toContainText("GBP 2,900.00");
    await expect(invoiceRecord).toContainText("GBP 580.00");
    await expect(invoiceRecord).toContainText("GBP 3,480.00");
    await expect(invoiceRecord).toContainText("Codernetic Ltd");
    await expect(invoiceRecord).toContainText("UK VAT at 20%");
    await expect(invoiceRecord).toContainText("UK VAT applies.");
    await expect(invoiceRecord).toContainText("2026-09-05");
    await issueFullCreditNote(page, "ACME-0008", "2026-09-06");

    workspace = await readWorkspaceState(userDataPath);
    expect(workspace.draft).toBeNull();
    expect(workspace.clients[0]?.invoiceSequence.nextNumber).toBe("9");
    expect(workspace.issuedInvoices).toHaveLength(1);
    expect(workspace.creditNotes).toHaveLength(1);
    const invoice = workspace.issuedInvoices[0];
    if (!invoice) throw new Error("Expected one issued GBP VAT invoice");
    expect(invoice).toMatchObject({
      id: "ACME-0008",
      serviceLines: [{ vatRate: "20" }],
      totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
      taxFacts: {
        kind: "gbp-uk-vat",
        vatTreatment: {
          kind: "uk-taxable",
          taxPoint: "2026-09-05",
          wording: "UK VAT applies.",
        },
      },
    });
    const retainedPdfPath = join(userDataPath, "retained-pdfs", invoice.retainedPdf.filename);
    await verifyRetainedInvoicePdf({
      rasterBaselinePath: join(pdfBaselineDirectory, "gbp-vat-invoice-144dpi.png"),
      pdfPath: retainedPdfPath,
      requiredText: [
        "INVOICE ACME-0008",
        "Codernetic Ltd",
        "Acme Research Ltd",
        "GBP 2,900.00",
        "GBP 580.00",
        "GBP 3,480.00",
        "Tax point: 2026-09-05",
        "20%",
        "UK VAT applies.",
        "VAT Registration Number 388 8021 60",
        "Company Reg. No. 8822243",
      ],
      workingDirectory: testInfo.outputPath("gbp-vat-invoice"),
    });
    await verifyRetainedInvoicePdf({
      pdfPath: join(userDataPath, "retained-pdfs", "CN-ACME-0008.pdf"),
      requiredText: [
        "CREDIT NOTE CN-ACME-0008",
        "References invoice ACME-0008, issued 2026-09-06",
        "The billed service period was incorrect.",
        "GBP -2,900.00",
        "GBP -580.00",
        "GBP -3,480.00",
        "UK VAT applies.",
      ],
      workingDirectory: join(userDataPath, "credit-note-pdf-verification"),
    });

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Invoices" }).click();
    await expect(page.getByRole("article", { name: "Invoice ACME-0008" })).toContainText(
      "Fully credited",
    );
    await expect(page.getByRole("article", { name: "Credit note CN-ACME-0008" })).toContainText(
      "GBP -3,480.00",
    );
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByText(/Only the final issue action can consume ACME-0009/)).toBeVisible();
    await expect(readWorkspaceState(userDataPath)).resolves.toEqual(workspace);
  } finally {
    await closeApp(electronApp);
  }
});

test("a foreign-currency UK VAT invoice retains sterling evidence and exact PDF bytes", async ({
  browserName: _browserName,
}, testInfo) => {
  const userDataPath = await createUserDataPath("foreign-currency-uk-vat-invoice");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeForeignCurrencyVatClient],
      issuer: completeIssuer,
    }),
  );
  let electronApp = await launchProductionApp(userDataPath);

  try {
    let page = await electronApp.firstWindow();
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Period start").fill("2026-09-02");
    await page.getByLabel("Period end").fill("2026-09-05");
    await page.getByLabel("Billable days").fill("4");
    await page.getByRole("tab", { name: "Tax & issue" }).click();
    await page.getByLabel("Issue date").fill("2026-09-06");
    await page.getByLabel("Tax point").fill("2026-09-05");
    await page.getByLabel("Exchange rate (USD per GBP)").fill("1.25");
    await page.getByLabel("Exchange-rate effective date").fill("2026-09-05");
    await page.getByLabel("Exchange-rate method").selectOption("hmrc-period-rate");
    await page
      .getByLabel("Exchange-rate evidence reference")
      .fill("HMRC monthly exchange rates, September 2026");
    await expect(page.getByText("Saved on this Mac")).toBeVisible();

    const preview = page.getByLabel("Invoice preview");
    await expect(preview).toContainText("USD 3,480.00");
    await expect(preview).toContainText("GBP 2,784.00");
    await expect(preview).toContainText("1 GBP = 1.25 USD");
    await expectPreviewFits(preview);

    await page.getByRole("button", { name: "Review and issue" }).click();
    const dialog = page.getByRole("dialog", { name: "Issue invoice USDVAT-0012?" });
    await expect(dialog).toContainText("USD 3,480.00");
    await expect(dialog).toContainText("GBP 2,784.00");
    await expect(dialog).toContainText("HMRC monthly exchange rates, September 2026");
    await dialog.getByRole("button", { name: "Issue USDVAT-0012" }).click();

    const invoiceRecord = page.getByRole("article", { name: "Invoice USDVAT-0012" });
    await expect(invoiceRecord).toContainText("USD 3,480.00");
    await expect(invoiceRecord).toContainText("GBP 2,784.00");
    await expect(invoiceRecord).toContainText("1 GBP = 1.25 USD");
    await expect(invoiceRecord).toContainText("HMRC period rate");
    await issueFullCreditNote(page, "USDVAT-0012", "2026-09-06");

    const issuedWorkspace = await readWorkspaceState(userDataPath);
    expect(issuedWorkspace.draft).toBeNull();
    expect(issuedWorkspace.clients[0]?.invoiceSequence.nextNumber).toBe("13");
    expect(issuedWorkspace.creditNotes).toHaveLength(1);
    const invoice = issuedWorkspace.issuedInvoices[0];
    if (!invoice) throw new Error("Expected one issued foreign-currency VAT invoice");
    expect(invoice).toMatchObject({
      taxFacts: {
        kind: "foreign-currency-uk-vat",
        sterlingVatSummary: {
          exchangeRecord: {
            effectiveDate: "2026-09-05",
            evidenceReference: "HMRC monthly exchange rates, September 2026",
            method: "hmrc-period-rate",
            rate: "1.25",
          },
          totals: { gross: "2784.00", net: "2320.00", vat: "464.00" },
        },
      },
      totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
    });

    const retainedPdfPath = join(userDataPath, "retained-pdfs", invoice.retainedPdf.filename);
    const retainedBytes = await readFile(retainedPdfPath);
    expect(createHash("sha256").update(retainedBytes).digest("hex")).toBe(
      invoice.retainedPdf.sha256,
    );
    await verifyRetainedInvoicePdf({
      rasterBaselinePath: join(pdfBaselineDirectory, "foreign-currency-vat-invoice-144dpi.png"),
      pdfPath: retainedPdfPath,
      requiredText: [
        "INVOICE USDVAT-0012",
        "Acme Research US",
        "USD 2,900.00",
        "USD 580.00",
        "VAT AMOUNTS IN STERLING",
        "GBP 2,320.00",
        "GBP 464.00",
        "1 GBP = 1.25 USD",
        "Effective date: 2026-09-05",
        "HMRC period rate",
        "HMRC monthly exchange rates, September 2026",
      ],
      workingDirectory: testInfo.outputPath("pdf-verification"),
    });
    const creditNote = issuedWorkspace.creditNotes[0];
    if (!creditNote) throw new Error("Expected one issued foreign-currency credit note");
    const creditNotePdfPath = join(userDataPath, "retained-pdfs", creditNote.retainedPdf.filename);
    const creditNotePdfBytes = await readFile(creditNotePdfPath);
    expect(createHash("sha256").update(creditNotePdfBytes).digest("hex")).toBe(
      creditNote.retainedPdf.sha256,
    );
    await verifyRetainedInvoicePdf({
      rasterBaselinePath: join(
        pdfBaselineDirectory,
        "foreign-currency-full-credit-note-144dpi.png",
      ),
      pdfPath: creditNotePdfPath,
      requiredText: [
        "CREDIT NOTE CN-USDVAT-0012",
        "USD -3,480.00",
        "VAT AMOUNTS IN STERLING",
        "GBP -2,320.00",
        "GBP -464.00",
        "1 GBP = 1.25 USD",
        "HMRC monthly exchange rates, September 2026",
      ],
      workingDirectory: testInfo.outputPath("credit-note-pdf-verification"),
    });
    const exportedPdfPath = join(userDataPath, "USDVAT-0012-export.pdf");
    await electronApp.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
    }, exportedPdfPath);
    await invoiceRecord.getByRole("button", { name: "Export USDVAT-0012" }).click();
    await expect(invoiceRecord.getByText("Exported the retained PDF.")).toBeVisible();
    await expect(readFile(exportedPdfPath)).resolves.toEqual(retainedBytes);

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Invoices" }).click();
    await expect(page.getByRole("article", { name: "Invoice USDVAT-0012" })).toContainText(
      "Fully credited",
    );
    const restartedCreditNoteRecord = page.getByRole("article", {
      name: "Credit note CN-USDVAT-0012",
    });
    await expect(restartedCreditNoteRecord).toContainText("GBP -2,784.00");
    const restartedCreditExportPath = testInfo.outputPath("credit-note-after-restart.pdf");
    await electronApp.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
    }, restartedCreditExportPath);
    await restartedCreditNoteRecord.getByRole("button", { name: "Export CN-USDVAT-0012" }).click();
    await expect(restartedCreditNoteRecord.getByText("Exported the retained PDF.")).toBeVisible();
    await expect(readFile(restartedCreditExportPath)).resolves.toEqual(creditNotePdfBytes);
    await expect(readWorkspaceState(userDataPath)).resolves.toEqual(issuedWorkspace);
    await expect(readFile(retainedPdfPath)).resolves.toEqual(retainedBytes);
    await expect(readFile(creditNotePdfPath)).resolves.toEqual(creditNotePdfBytes);
  } finally {
    await closeApp(electronApp);
  }
});

test("a multi-item invoice recovers, credits, replaces, and retains exact PDFs", async ({
  browserName: _browserName,
}, testInfo) => {
  const userDataPath = await createUserDataPath("invoice-issue");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: completeIssuer,
    }),
  );
  let electronApp = await launchProductionApp(userDataPath);

  try {
    let page = await electronApp.firstWindow();
    const browserWindow = await electronApp.browserWindow(page);
    await browserWindow.evaluate((window) => window.setContentSize(1040, 820));
    await completeDraftForIssue(page);
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByRole("button", { name: "+ Add item" }).click();
    const secondItem = page.getByRole("region", { name: /^2/u });
    await secondItem.getByLabel("Service description").fill("Architecture workshop");
    await secondItem.getByLabel("Period start").fill("2026-09-03");
    await secondItem.getByLabel("Period end").fill("2026-09-04");
    await secondItem.getByLabel("Billable days").fill("2");
    await secondItem.getByLabel("Day rate").fill("500");
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    await expectPreviewFits(page.getByLabel("Invoice preview"));

    const recoverableState = await readWorkspaceState(userDataPath);
    expect(recoverableState.draft?.draft.serviceLines).toHaveLength(2);
    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Resume draft" }).click();
    await page.getByRole("tab", { name: "Work" }).click();
    await expect(page.getByRole("button", { name: /Architecture workshop/ })).toBeVisible();
    await reviewAndIssueInvoice(page);

    const invoiceRecord = page.getByRole("article", { name: "Invoice GGIOHK-0043" });
    await expect(invoiceRecord).toBeVisible();
    await expect(invoiceRecord).toContainText("USD 3,900.00");
    const issuedState = await readWorkspaceState(userDataPath);
    expect(issuedState.draft).toBeNull();
    expect(issuedState.clients[0]?.invoiceSequence.nextNumber).toBe("44");
    expect(issuedState.issuedInvoices).toHaveLength(1);
    const issuedInvoice = issuedState.issuedInvoices[0];
    if (!issuedInvoice) throw new Error("Expected one issued invoice");
    expect(issuedInvoice.serviceLines).toMatchObject([
      {
        serviceDescription: "React Native consultancy\nProject delivery",
        totals: { gross: "2900.00", net: "2900.00", vat: "0.00" },
      },
      {
        serviceDescription: "Architecture workshop",
        totals: { gross: "1000.00", net: "1000.00", vat: "0.00" },
      },
    ]);
    const retainedPdfPath = join(userDataPath, "retained-pdfs", issuedInvoice.retainedPdf.filename);
    const retainedBytes = await readFile(retainedPdfPath);
    expect(createHash("sha256").update(retainedBytes).digest("hex")).toBe(
      issuedInvoice.retainedPdf.sha256,
    );
    expect(retainedBytes.subarray(0, 5).toString()).toBe("%PDF-");
    await verifyRetainedInvoicePdf({
      rasterBaselinePath: join(pdfBaselineDirectory, "outside-scope-invoice-144dpi.png"),
      pdfPath: retainedPdfPath,
      requiredText: [
        "INVOICE GGIOHK-0043",
        "Genesis Global",
        "Architecture workshop",
        "USD 3,900.00",
        "Outside the scope of UK VAT.",
        "Company Reg. No. 8822243",
      ],
      workingDirectory: testInfo.outputPath("outside-scope-invoice"),
    });
    await issueFullCreditNote(page, "GGIOHK-0043", "2026-09-06", false);
    const creditedState = await readWorkspaceState(userDataPath);
    expect(creditedState.issuedInvoices).toEqual(issuedState.issuedInvoices);
    expect(creditedState.clients[0]?.invoiceSequence.nextNumber).toBe("44");
    expect(creditedState.creditNotes).toHaveLength(1);
    expect(creditedState.creditNotes[0]).toMatchObject({
      serviceLines: [
        { billableDays: "-4", totals: { gross: "-2900.00", net: "-2900.00", vat: "0.00" } },
        { billableDays: "-2", totals: { gross: "-1000.00", net: "-1000.00", vat: "0.00" } },
      ],
      totals: { gross: "-3900.00", net: "-3900.00", vat: "0.00" },
    });
    await verifyRetainedInvoicePdf({
      rasterBaselinePath: join(pdfBaselineDirectory, "full-credit-note-144dpi.png"),
      pdfPath: join(userDataPath, "retained-pdfs", "CN-GGIOHK-0043.pdf"),
      requiredText: [
        "CREDIT NOTE CN-GGIOHK-0043",
        "References invoice GGIOHK-0043, issued 2026-09-04",
        "Architecture workshop",
        "USD -3,900.00",
        "Outside the scope of UK VAT.",
        "The billed service period was incorrect.",
      ],
      workingDirectory: testInfo.outputPath("full-credit-note"),
    });

    await expect(page.getByRole("button", { name: "Create replacement" })).toBeVisible();
    await expect(readWorkspaceState(userDataPath)).resolves.toEqual(creditedState);
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Create invoice" }).click();
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Service description").fill("Existing draft work to preserve");
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    await page.getByRole("button", { name: "Invoices" }).click();
    await page.getByRole("button", { name: "View chain for GGIOHK-0043" }).click();
    await page.getByRole("button", { name: "Create replacement" }).click();
    await expect(page.getByRole("button", { name: "Keep current draft" })).toBeVisible();
    await page.getByRole("button", { name: "Keep current draft" }).click();
    await expect(page.getByLabel("Service description")).toHaveValue(
      "Existing draft work to preserve",
    );
    await page.getByRole("button", { name: "Invoices" }).click();
    await page.getByRole("button", { name: "View chain for GGIOHK-0043" }).click();
    await page.getByRole("button", { name: "Create replacement" }).click();
    await page
      .getByRole("button", { name: "Discard current draft and create replacement" })
      .click();
    await expect(page.getByText("Replacement for GGIOHK-0043")).toBeVisible();
    await expect(page.getByText("Current issuer: Codernetic Ltd")).toBeVisible();
    await expect(page.getByText("Current client: Genesis Global")).toBeVisible();
    await expect(page.getByText("Next invoice if issued: GGIOHK-0044")).toBeVisible();
    await expect(page.getByLabel("Issue date")).toHaveValue("");
    const replacementDraftState = await readWorkspaceState(userDataPath);
    expect(replacementDraftState.clients[0]?.invoiceSequence.nextNumber).toBe("44");
    expect(replacementDraftState.issuedInvoices).toEqual(creditedState.issuedInvoices);
    expect(replacementDraftState.draft).toMatchObject({
      kind: "replacement",
      source: "GGIOHK-0043",
      draft: {
        serviceLines: [
          { serviceDescription: "React Native consultancy\nProject delivery" },
          { serviceDescription: "Architecture workshop" },
        ],
      },
    });

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath, ["pdf-generation"]);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Resume draft" }).click();
    await expect(page.getByText("Replacement for GGIOHK-0043")).toBeVisible();
    await page.getByRole("tab", { name: "Tax & issue" }).click();
    await page.getByLabel("Issue date").fill("2026-09-08");
    await expect(page.getByText("Saved on this Mac")).toBeVisible();

    await page.getByRole("button", { name: "Review and issue" }).click();
    let dialog = page.getByRole("dialog", { name: "Issue invoice GGIOHK-0044?" });
    await expect(dialog).toContainText("Codernetic Ltd");
    await expect(dialog).toContainText("Genesis Global");
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    const reviewedReplacementState = await readWorkspaceState(userDataPath);
    expect(reviewedReplacementState.clients[0]?.invoiceSequence.nextNumber).toBe("44");
    expect(reviewedReplacementState.draft).toEqual({
      kind: "replacement",
      source: "GGIOHK-0043",
      draft: {
        ...replacementDraftState.draft?.draft,
        issueDate: "2026-09-08",
      },
    });

    await page.getByRole("button", { name: "Review and issue" }).click();
    dialog = page.getByRole("dialog", { name: "Issue invoice GGIOHK-0044?" });
    await dialog.getByRole("button", { name: "Issue GGIOHK-0044" }).click();
    await expect(
      page.getByText(
        "The invoice was not issued. Your draft is safe, and GGIOHK-0044 was not used. Review and try again.",
      ),
    ).toBeVisible();
    await expect(readWorkspaceState(userDataPath)).resolves.toEqual(reviewedReplacementState);

    await page.getByRole("button", { name: "Review and issue" }).click();
    dialog = page.getByRole("dialog", { name: "Issue invoice GGIOHK-0044?" });
    await dialog.getByRole("button", { name: "Issue GGIOHK-0044" }).click();
    const correctionChain = page.getByRole("region", {
      name: "Correction chain from GGIOHK-0043",
    });
    await expect(
      correctionChain.getByRole("article", { name: "Invoice GGIOHK-0043" }),
    ).toBeVisible();
    await expect(
      correctionChain.getByRole("article", { name: "Credit note CN-GGIOHK-0043" }),
    ).toBeVisible();
    await expect(
      correctionChain.getByRole("article", { name: "Invoice GGIOHK-0044" }),
    ).toBeVisible();
    for (const documentId of ["GGIOHK-0043", "CN-GGIOHK-0043", "GGIOHK-0044"]) {
      await expect(
        correctionChain.getByRole("button", { name: `Open ${documentId}` }),
      ).toBeVisible();
    }

    const replacedState = await readWorkspaceState(userDataPath);
    expect(replacedState.clients[0]?.invoiceSequence.nextNumber).toBe("45");
    expect(replacedState.draft).toBeNull();
    expect(replacedState.issuedInvoices).toHaveLength(2);
    await verifyRetainedInvoicePdf({
      pdfPath: join(userDataPath, "retained-pdfs", "GGIOHK-0044.pdf"),
      requiredText: [
        "INVOICE GGIOHK-0044",
        "Genesis Global",
        "Architecture workshop",
        "USD 3,900.00",
        "Outside the scope of UK VAT.",
      ],
      workingDirectory: join(userDataPath, "replacement-pdf-verification"),
    });

    await issueFullCreditNote(page, "GGIOHK-0044", "2026-09-08", false);
    await page.getByRole("button", { name: "Create replacement" }).click();
    await expect(page.getByText("Replacement for GGIOHK-0044")).toBeVisible();
    await page.getByRole("tab", { name: "Tax & issue" }).click();
    await page.getByLabel("Issue date").fill("2026-09-08");
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    await page.getByRole("button", { name: "Review and issue" }).click();
    dialog = page.getByRole("dialog", { name: "Issue invoice GGIOHK-0045?" });
    await dialog.getByRole("button", { name: "Issue GGIOHK-0045" }).click();

    const completeChain = page.getByRole("region", {
      name: "Correction chain from GGIOHK-0043",
    });
    const chainDocumentIds = [
      "GGIOHK-0043",
      "CN-GGIOHK-0043",
      "GGIOHK-0044",
      "CN-GGIOHK-0044",
      "GGIOHK-0045",
    ];
    for (const documentId of chainDocumentIds) {
      await expect(completeChain.getByRole("button", { name: `Open ${documentId}` })).toBeVisible();
    }

    const twiceReplacedState = await readWorkspaceState(userDataPath);
    expect(twiceReplacedState.clients[0]?.invoiceSequence.nextNumber).toBe("46");
    expect(twiceReplacedState.issuedInvoices).toMatchObject([
      { id: "GGIOHK-0043", replacesInvoiceId: null },
      { id: "GGIOHK-0044", replacesInvoiceId: "GGIOHK-0043" },
      { id: "GGIOHK-0045", replacesInvoiceId: "GGIOHK-0044" },
    ]);
    expect(twiceReplacedState.creditNotes).toHaveLength(2);
    await verifyRetainedInvoicePdf({
      pdfPath: join(userDataPath, "retained-pdfs", "CN-GGIOHK-0044.pdf"),
      requiredText: [
        "CREDIT NOTE CN-GGIOHK-0044",
        "References invoice GGIOHK-0044, issued 2026-09-08",
        "Architecture workshop",
        "USD -3,900.00",
      ],
      workingDirectory: join(userDataPath, "second-credit-note-pdf-verification"),
    });
    await verifyRetainedInvoicePdf({
      pdfPath: join(userDataPath, "retained-pdfs", "GGIOHK-0045.pdf"),
      requiredText: [
        "INVOICE GGIOHK-0045",
        "Genesis Global",
        "Architecture workshop",
        "USD 3,900.00",
      ],
      workingDirectory: join(userDataPath, "second-replacement-pdf-verification"),
    });

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Invoices" }).click();
    await expect(
      page.getByRole("region", { name: "Correction chain from GGIOHK-0043" }),
    ).toContainText("GGIOHK-0045");
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(
      page.getByText(/Only the final issue action can consume GGIOHK-0046/),
    ).toBeVisible();
    await expect(readWorkspaceState(userDataPath)).resolves.toEqual(twiceReplacedState);
  } finally {
    await closeApp(electronApp);
  }
});

test("a non-basic-Latin client name uses the bundled production PDF font", async ({
  browserName: _browserName,
}, testInfo) => {
  const userDataPath = await createUserDataPath("non-latin-invoice");
  const client = persistedClientSchema.parse({
    ...completeClient,
    legalName: "Công ty Nghiên cứu",
  });
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [client],
      issuer: completeIssuer,
    }),
  );
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    await completeDraftForIssue(page);
    await reviewAndIssueInvoice(page);
    await expect(page.getByRole("article", { name: "Invoice GGIOHK-0043" })).toBeVisible();
    const workspace = await readWorkspaceState(userDataPath);
    const invoice = workspace.issuedInvoices[0];
    if (!invoice) throw new Error("Expected an issued invoice with a non-basic-Latin client name");
    await verifyRetainedInvoicePdf({
      pdfPath: join(userDataPath, "retained-pdfs", invoice.retainedPdf.filename),
      requiredText: ["INVOICE GGIOHK-0043", "Công ty Nghiên cứu"],
      workingDirectory: testInfo.outputPath("non-latin-pdf"),
    });
  } finally {
    await closeApp(electronApp);
  }
});

const issueFaultPoints = [
  "pdf-generation",
  "pdf-verification",
  "retained-pdf-write",
  "temporary-state-write",
  "candidate-state-validation",
  "durable-state-rename",
] satisfies readonly FaultPoint[];

for (const faultPoint of issueFaultPoints) {
  test(`${faultPoint} failure keeps the recoverable draft and does not consume its number`, async () => {
    const userDataPath = await createUserDataPath(`invoice-${faultPoint}`);
    const recoverableWorkspace = createRecoverableWorkspace();
    await writeFile(
      join(userDataPath, "state.json"),
      serializeWorkspaceState(recoverableWorkspace),
    );
    let electronApp = await launchProductionApp(userDataPath, [faultPoint]);

    try {
      let page = await electronApp.firstWindow();
      await page.getByRole("button", { name: "Resume draft" }).click();
      await reviewAndIssueInvoice(page);

      await expect(
        page.getByText(
          "The invoice was not issued. Your draft is safe, and GGIOHK-0043 was not used. Review and try again.",
        ),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Review and issue" })).toBeEnabled();
      await expect(readWorkspaceState(userDataPath)).resolves.toEqual(recoverableWorkspace);

      await reviewAndIssueInvoice(page);
      await expect(page.getByRole("article", { name: "Invoice GGIOHK-0043" })).toBeVisible();
      const issuedWorkspace = await readWorkspaceState(userDataPath);
      expect(issuedWorkspace.draft).toBeNull();
      expect(issuedWorkspace.clients[0]?.invoiceSequence.nextNumber).toBe("44");
      expect(issuedWorkspace.issuedInvoices).toHaveLength(1);

      await closeApp(electronApp);
      electronApp = await launchProductionApp(userDataPath);
      page = await electronApp.firstWindow();
      await page.getByRole("button", { name: "Invoices" }).click();
      await expect(page.getByRole("article", { name: "Invoice GGIOHK-0043" })).toBeVisible();
      await expect(readWorkspaceState(userDataPath)).resolves.toEqual(issuedWorkspace);
      await expect(
        access(join(userDataPath, "retained-pdfs", "GGIOHK-0043.pdf")),
      ).resolves.toBeUndefined();
    } finally {
      await closeApp(electronApp);
    }
  });
}

test("a failed autosave is retried before review and stops issue when it still fails", async () => {
  const userDataPath = await createUserDataPath("invoice-draft-save-failure");
  const recoverableWorkspace = createRecoverableWorkspace();
  await writeFile(join(userDataPath, "state.json"), serializeWorkspaceState(recoverableWorkspace));
  const electronApp = await launchProductionApp(userDataPath, ["draft-save", "draft-save"]);

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Resume draft" }).click();
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Notes").fill("Latest unsaved note");
    await expect(page.getByText("Could not save draft. Your edits are still here.")).toBeVisible();

    await page.getByRole("button", { name: "Review and issue" }).click();

    await expect(
      page.getByText("Save the latest draft before preparing the final issue review."),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: /Issue invoice/u })).toHaveCount(0);
    await expect(readWorkspaceState(userDataPath)).resolves.toEqual(recoverableWorkspace);
    await expect(access(join(userDataPath, "retained-pdfs", "GGIOHK-0043.pdf"))).rejects.toThrow(
      "ENOENT",
    );
  } finally {
    await closeApp(electronApp);
  }
});

test("post-commit document failures keep the issued invoice and each retry action available", async () => {
  const userDataPath = await createUserDataPath("invoice-document-action-failures");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: completeIssuer,
    }),
  );
  let electronApp = await launchProductionApp(userDataPath, [
    "document-open",
    "document-export",
    "document-print",
    "document-open",
    "document-export",
    "document-print",
  ]);

  try {
    let page = await electronApp.firstWindow();
    await completeDraftForIssue(page);
    await reviewAndIssueInvoice(page);

    const invoiceRecord = page.getByRole("article", { name: "Invoice GGIOHK-0043" });
    await expect(invoiceRecord).toBeVisible();
    const issuedWorkspace = await readWorkspaceState(userDataPath);

    await invoiceRecord.getByRole("button", { name: "Open GGIOHK-0043" }).click();
    await expect(invoiceRecord.getByText("Could not open the retained PDF.")).toBeVisible();
    await invoiceRecord.getByRole("button", { name: "Export GGIOHK-0043" }).click();
    await expect(invoiceRecord.getByText("Could not export the retained PDF.")).toBeVisible();
    await invoiceRecord.getByRole("button", { name: "Print GGIOHK-0043" }).click();
    await expect(invoiceRecord.getByText("Could not print the retained PDF.")).toBeVisible();

    await invoiceRecord.getByRole("button", { name: "Open GGIOHK-0043" }).click();
    await expect(invoiceRecord.getByText("Could not open the retained PDF.")).toBeVisible();
    await invoiceRecord.getByRole("button", { name: "Export GGIOHK-0043" }).click();
    await expect(invoiceRecord.getByText("Could not export the retained PDF.")).toBeVisible();
    await invoiceRecord.getByRole("button", { name: "Print GGIOHK-0043" }).click();
    await expect(invoiceRecord.getByText("Could not print the retained PDF.")).toBeVisible();

    await expect(readWorkspaceState(userDataPath)).resolves.toEqual(issuedWorkspace);
    expect(issuedWorkspace.draft).toBeNull();
    expect(issuedWorkspace.clients[0]?.invoiceSequence.nextNumber).toBe("44");
    expect(issuedWorkspace.issuedInvoices).toHaveLength(1);
    await expect(
      access(join(userDataPath, "retained-pdfs", "GGIOHK-0043.pdf")),
    ).resolves.toBeUndefined();
    await expect(invoiceRecord.getByRole("button", { name: "Open GGIOHK-0043" })).toBeEnabled();
    await expect(invoiceRecord.getByRole("button", { name: "Export GGIOHK-0043" })).toBeEnabled();
    await expect(invoiceRecord.getByRole("button", { name: "Print GGIOHK-0043" })).toBeEnabled();

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Invoices" }).click();
    await expect(page.getByRole("article", { name: "Invoice GGIOHK-0043" })).toBeVisible();
    await expect(readWorkspaceState(userDataPath)).resolves.toEqual(issuedWorkspace);
  } finally {
    await closeApp(electronApp);
  }
});

test("the production renderer blocks a valid amount that overflows the fixed document", async () => {
  const userDataPath = await createUserDataPath("invoice-overflow");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: completeIssuer,
    }),
  );
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Period start").fill("2026-09-04");
    await page.getByLabel("Period end").fill("2026-09-04");
    await page.getByLabel("Billable days").fill("1");
    await page.getByLabel("Day rate").fill("9".repeat(200));
    await page.getByRole("tab", { name: "Tax & issue" }).click();
    await page.getByLabel("Issue date").fill("2026-09-04");
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    await page.getByRole("button", { name: "Review and issue" }).click();

    await expect(page.getByText("The invoice does not fit the fixed A4 layout.")).toBeVisible();
    const unchangedState = await readWorkspaceState(userDataPath);
    expect(unchangedState.draft).not.toBeNull();
    expect(unchangedState.clients[0]?.invoiceSequence.nextNumber).toBe("43");
    expect(unchangedState.issuedInvoices).toHaveLength(0);
  } finally {
    await closeApp(electronApp);
  }
});

test("the production renderer detects issuer text clipped inside the document header", async () => {
  const userDataPath = await createUserDataPath("invoice-header-overflow");
  const issuerWithUnbrokenAddress = persistedIssuerSettingsSchema.parse({
    ...completeIssuer,
    registeredAddress: "A".repeat(1_000),
  });
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: issuerWithUnbrokenAddress,
    }),
  );
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Period start").fill("2026-09-04");
    await page.getByLabel("Period end").fill("2026-09-04");
    await page.getByLabel("Billable days").fill("1");
    await page.getByRole("tab", { name: "Tax & issue" }).click();
    await page.getByLabel("Issue date").fill("2026-09-04");
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    await page.getByRole("button", { name: "Review and issue" }).click();

    await expect(page.getByText("The invoice does not fit the fixed A4 layout.")).toBeVisible();
    const unchangedState = await readWorkspaceState(userDataPath);
    expect(unchangedState.draft).not.toBeNull();
    expect(unchangedState.clients[0]?.invoiceSequence.nextNumber).toBe("43");
    expect(unchangedState.issuedInvoices).toHaveLength(0);
  } finally {
    await closeApp(electronApp);
  }
});

for (const client of [completeClient, completeGbpVatClient]) {
  test(`a ${client.currency.code} ${client.vatTreatment.kind} credit note fits a wrapped monthly-invoice correction reason`, async ({
    browserName: _browserName,
  }, testInfo) => {
    const reason =
      "A monthly invoice is needed, rather than a weekly one. This invoice was moved to ICRONI-005 with the other month's invoices.";
    const userDataPath = await createUserDataPath("credit-note-wrapped-reason");
    await writeFile(
      join(userDataPath, "state.json"),
      serializeWorkspaceState({
        ...initialWorkspaceState,
        clients: [client],
        issuer: completeIssuer,
      }),
    );
    const electronApp = await launchProductionApp(userDataPath);

    try {
      const page = await electronApp.firstWindow();
      await page.getByRole("tab", { name: "Work" }).click();
      await page.getByLabel("Period start").fill("2026-09-01");
      await page.getByLabel("Period end").fill("2026-09-04");
      await page.getByLabel("Billable days").fill("4");
      await page.getByRole("tab", { name: "Tax & issue" }).click();
      await page.getByLabel("Issue date").fill("2026-09-04");
      await expect(page.getByText("Saved on this Mac")).toBeVisible();
      await page.getByRole("button", { name: "Review and issue" }).click();
      const issueDialog = page.getByRole("dialog", { name: /^Issue invoice /u });
      await issueDialog.getByRole("button", { name: /^Issue /u }).click();
      await expect(page.getByRole("button", { name: /^Correct /u })).toBeVisible();
      const issuedWorkspace = await readWorkspaceState(userDataPath);
      const invoice = issuedWorkspace.issuedInvoices[0];
      if (!invoice) throw new Error("Expected an issued invoice to correct");
      const invoicePdfPath = join(userDataPath, "retained-pdfs", invoice.retainedPdf.filename);
      const originalPdfBytes = await readFile(invoicePdfPath);
      await page.getByRole("button", { name: `Correct ${invoice.id}` }).click();
      await page.getByLabel("Correction reason").fill(reason);
      await page.getByLabel("Credit-note issue date").fill("2026-10-14");
      await expectPreviewFits(page.getByLabel("Credit note preview"));
      await page.getByRole("button", { name: "Review and issue credit note" }).click();
      const dialog = page.getByRole("dialog", { name: `Issue credit note CN-${invoice.id}?` });
      await dialog.getByRole("button", { name: `Issue CN-${invoice.id}` }).click();
      await expect(page.getByText("The original is fully credited.")).toBeVisible();

      const creditedWorkspace = await readWorkspaceState(userDataPath);
      expect(creditedWorkspace.issuedInvoices).toEqual(issuedWorkspace.issuedInvoices);
      expect(creditedWorkspace.creditNotes).toHaveLength(1);
      const creditNote = creditedWorkspace.creditNotes[0];
      if (!creditNote) throw new Error("Expected the issued credit note");
      expect(creditNote.reason).toBe(reason);
      await expect(readFile(invoicePdfPath)).resolves.toEqual(originalPdfBytes);
      const creditNotePdfPath = join(
        userDataPath,
        "retained-pdfs",
        creditNote.retainedPdf.filename,
      );
      await verifyRetainedInvoicePdf({
        pdfPath: creditNotePdfPath,
        requiredText: [`References invoice ${invoice.id}`],
        workingDirectory: testInfo.outputPath("wrapped-reason-credit-note"),
      });
      const creditNoteText = execFileSync("pdftotext", ["-layout", creditNotePdfPath, "-"], {
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(creditNoteText.replace(/\s+/gu, " ")).toContain(reason);
    } finally {
      await closeApp(electronApp);
    }
  });
}

test("the production renderer blocks a full credit note whose reason exceeds its fixed region", async () => {
  const userDataPath = await createUserDataPath("credit-note-overflow");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: completeIssuer,
    }),
  );
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    await completeDraftForIssue(page);
    await reviewAndIssueInvoice(page);
    const invoiceRecord = page.getByRole("article", { name: "Invoice GGIOHK-0043" });
    await expect(invoiceRecord).toBeVisible();
    const issuedWorkspace = await readWorkspaceState(userDataPath);
    expect(issuedWorkspace.issuedInvoices).toHaveLength(1);
    await invoiceRecord.getByRole("button", { name: "Correct GGIOHK-0043" }).click();
    await page
      .getByLabel("Correction reason")
      .fill("The invoiced service dates are incorrect. ".repeat(20));
    await page.getByLabel("Credit-note issue date").fill("2026-09-04");
    await page.getByRole("button", { name: "Review and issue credit note" }).click();

    await expect(page.getByText("The credit note does not fit the fixed A4 layout.")).toBeVisible();
    const unchangedWorkspace = await readWorkspaceState(userDataPath);
    expect(unchangedWorkspace.issuedInvoices).toEqual(issuedWorkspace.issuedInvoices);
    expect(unchangedWorkspace.creditNotes).toHaveLength(0);
    await expect(
      access(join(userDataPath, "retained-pdfs", "GGIOHK-0043.pdf")),
    ).resolves.toBeUndefined();
    await expect(access(join(userDataPath, "retained-pdfs", "CN-GGIOHK-0043.pdf"))).rejects.toThrow(
      "ENOENT",
    );
  } finally {
    await closeApp(electronApp);
  }
});

async function completeDraftForIssue(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Work" }).click();
  await page.getByLabel("Period start").fill("2026-09-01");
  await page.getByLabel("Period end").fill("2026-09-04");
  await page.getByLabel("Billable days").fill("4");
  await page.getByRole("tab", { name: "Tax & issue" }).click();
  await page.getByLabel("Issue date").fill("2026-09-04");
  await expect(page.getByText("Saved on this Mac")).toBeVisible();
  await expectPreviewFits(page.getByLabel("Invoice preview"));
}

async function reviewAndIssueInvoice(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Review and issue" }).click();
  const dialog = page.getByRole("dialog", { name: "Issue invoice GGIOHK-0043?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Issue GGIOHK-0043" }).click();
}

async function issueFullCreditNote(
  page: Page,
  invoiceId: string,
  issueDate: string,
  leaveCompletion = true,
): Promise<void> {
  const invoiceRecord = page.getByRole("article", { name: `Invoice ${invoiceId}` });
  await invoiceRecord.getByRole("button", { name: `Correct ${invoiceId}` }).click();
  await page.getByLabel("Correction reason").fill("The billed service period was incorrect.");
  await page.getByLabel("Credit-note issue date").fill(issueDate);
  const preview = page.getByLabel("Credit note preview");
  await expect(preview).toContainText(`CN-${invoiceId}`);
  await expectPreviewFits(preview);
  await page.getByRole("button", { name: "Review and issue credit note" }).click();
  const dialog = page.getByRole("dialog", { name: `Issue credit note CN-${invoiceId}?` });
  await expect(dialog).toContainText("The billed service period was incorrect.");
  await dialog.getByRole("button", { name: `Issue CN-${invoiceId}` }).click();
  await expect(page.getByText("The original is fully credited.")).toBeVisible();
  if (leaveCompletion) await page.getByRole("button", { name: "Done" }).click();
}

async function expectPreviewFits(preview: Locator): Promise<void> {
  const rawMeasurements: unknown = await preview.evaluate(collectBillingDocumentMeasurements);
  const measurements = billingDocumentMeasurementsSchema.parse(rawMeasurements);
  const fit = evaluateBillingDocumentFit(measurements);
  const failedRegions = fit.regions.filter((region) => fit.failures.includes(region.name));
  expect(fit.failures, JSON.stringify({ page: fit.page, failedRegions })).toEqual([]);
}

async function readWorkspaceState(userDataPath: string): Promise<WorkspaceState> {
  return parseWorkspaceState(await readFile(join(userDataPath, "state.json"), "utf8"));
}

function createRecoverableWorkspace(): WorkspaceState {
  return {
    ...initialWorkspaceState,
    clients: [completeClient],
    draft: {
      kind: "ordinary",
      draft: persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput),
    },
    issuer: completeIssuer,
  };
}
