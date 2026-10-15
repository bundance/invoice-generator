import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Locator, Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";

import { initialWorkspaceState } from "../../src/application/workspace.js";
import { persistedClientSchema } from "../../src/domain/clients/client.js";
import { persistedInvoiceDraftSchema } from "../../src/domain/invoices/invoice-draft.js";
import { persistedIssuedInvoiceSchema } from "../../src/domain/invoices/issued-invoice.js";
import { serializeWorkspaceState } from "../../src/infrastructure/persistence/workspace-state.js";
import { completeClient } from "../fixtures/client.js";
import { completeInvoiceDraftInput, completeIssuedInvoice } from "../fixtures/issued-invoice.js";
import { completeIssuer } from "../fixtures/issuer-settings.js";
import {
  closeApp,
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "./support/electron-test-app.js";

const minimumWindow = { height: 680, width: 1040 } as const;
const defaultWindow = { height: 900, width: 1440 } as const;
const tallWindow = { height: 1600, width: 1920 } as const;
const a4Ratio = 210 / 297;
const a4HeightPixels = (297 / 25.4) * 96;

test("generated invoice and credit-note PDFs remain usable across preview sizes", async () => {
  test.setTimeout(90_000);
  const userDataPath = await createUserDataPath("generated-pdf-preview");
  const retainedBytes = Buffer.from("%PDF-1.7\npreview fixture\n", "utf8");
  const retainedPdf = {
    filename: completeIssuedInvoice.retainedPdf.filename,
    sha256: createHash("sha256").update(retainedBytes).digest("hex"),
  };
  const historicalInvoice = persistedIssuedInvoiceSchema.parse({
    ...completeIssuedInvoice,
    retainedPdf,
  });
  const clientWithIssuedInvoice = persistedClientSchema.parse({
    ...completeClient,
    invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
  });
  await mkdir(join(userDataPath, "retained-pdfs"));
  await writeFile(join(userDataPath, "retained-pdfs", retainedPdf.filename), retainedBytes);
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [clientWithIssuedInvoice],
      draft: {
        draft: persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput),
        kind: "ordinary",
      },
      issuedInvoices: [historicalInvoice],
      issuer: completeIssuer,
    }),
  );
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Resume draft" }).click();
    const invoicePreview = page.getByLabel("Invoice preview");
    await expectGeneratedPdf(invoicePreview);
    const reviewAndIssue = page.getByRole("button", { name: "Review and issue" });
    await expect(reviewAndIssue).toBeEnabled();
    await invoicePreview.getByRole("button", { name: "Fit preview" }).click();
    await expect(reviewAndIssue).toBeEnabled();

    await setWindowSize({ electronApp, size: minimumWindow });
    const minimumInvoice = await expectFittedA4Page(invoicePreview);
    const fittedText = await readTextLayerGeometry(invoicePreview);
    await expectToolbarFits(invoicePreview);
    await expect(invoicePreview.getByLabel("Current zoom")).toHaveText("Fit");

    const invoiceZoomIn = invoicePreview.getByRole("button", { name: "Zoom in" });
    const invoiceZoomOut = invoicePreview.getByRole("button", { name: "Zoom out" });
    await invoiceZoomIn.focus();
    await page.keyboard.press("Enter");
    await expectZoom(invoicePreview, 125);
    await expect(invoicePreview).toHaveAttribute("data-preview-mode", "manual");
    await invoiceZoomOut.focus();
    await page.keyboard.press("Space");
    await expectZoom(invoicePreview, 100);

    await zoomToBound({ button: invoiceZoomIn, preview: invoicePreview, targetPercent: 200 });
    await expect(invoiceZoomIn).toBeDisabled();
    const manualPageSize = await expectScrollableA4Page(invoicePreview);
    const manualText = await readTextLayerGeometry(invoicePreview);
    const manualScaleRatio = manualPageSize.width / minimumInvoice.width;
    expect(manualText.width / fittedText.width).toBeCloseTo(manualScaleRatio, 1);
    expect(manualText.height / fittedText.height).toBeCloseTo(manualScaleRatio, 1);
    expect(manualText.leftRatio).toBeCloseTo(fittedText.leftRatio, 2);
    expect(manualText.topRatio).toBeCloseTo(fittedText.topRatio, 2);

    await setWindowSize({ electronApp, size: defaultWindow });
    await expectZoom(invoicePreview, 200);
    await expect(reviewAndIssue).toBeEnabled();
    const resizedManualPage = await invoicePreview
      .locator(".billing-pdf-preview__page")
      .first()
      .boundingBox();
    if (!resizedManualPage) throw new Error("Expected visible manual preview geometry");
    expect(resizedManualPage.width).toBeCloseTo(manualPageSize.width, 0);
    expect(resizedManualPage.height).toBeCloseTo(manualPageSize.height, 0);

    await zoomToBound({ button: invoiceZoomOut, preview: invoicePreview, targetPercent: 25 });
    await expect(invoiceZoomOut).toBeDisabled();
    await invoicePreview.getByRole("button", { name: "Fit preview" }).click();
    await expect(invoicePreview).toHaveAttribute("data-preview-mode", "fit");
    await expect(invoicePreview.getByLabel("Current zoom")).toHaveText("Fit");

    const defaultInvoice = await expectFittedA4Page(invoicePreview);
    expect(defaultInvoice.height).toBeGreaterThan(minimumInvoice.height);

    await setWindowSize({ electronApp, size: tallWindow });
    const tallInvoice = await expectFittedA4Page(invoicePreview);
    expect(tallInvoice.height).toBeCloseTo(a4HeightPixels, 0);
    expect(tallInvoice.width).toBeCloseTo((210 / 25.4) * 96, 0);
    expect(tallInvoice.height).toBeLessThanOrEqual(a4HeightPixels + 1);
    await invoicePreview.getByRole("button", { name: "Zoom out" }).click();
    await invoicePreview.getByRole("button", { name: "Zoom in" }).click();
    await expectZoom(invoicePreview, 100);
    await expect(reviewAndIssue).toBeEnabled();
    await invoicePreview.getByRole("button", { name: "Fit preview" }).click();
    await expect(reviewAndIssue).toBeEnabled();

    await setWindowSize({ electronApp, size: minimumWindow });
    await expectStickyPreview(page, invoicePreview);

    await page.getByRole("button", { name: "Invoices" }).click();
    await page
      .getByRole("article", { name: `Invoice ${completeIssuedInvoice.id}` })
      .getByRole("button", { name: `Correct ${completeIssuedInvoice.id}` })
      .click();
    await page.getByLabel("Correction reason").fill("The billed service period was incorrect.");
    const issueDate = await page.getByLabel("Credit-note issue date").getAttribute("max");
    if (!issueDate) throw new Error("Expected the credit-note issue date to have a maximum");
    await page.getByLabel("Credit-note issue date").fill(issueDate);

    const creditNotePreview = page.getByLabel("Credit note preview");
    await expectGeneratedPdf(creditNotePreview);
    await expect(creditNotePreview).toHaveAttribute("data-preview-mode", "fit");
    await expectCreditNoteColumns(page.locator(".credit-note-controls"), creditNotePreview);
    await expectFittedA4Page(creditNotePreview);
    await expectToolbarFits(creditNotePreview);

    await creditNotePreview.getByRole("button", { name: "Zoom in" }).click();
    await expectZoom(creditNotePreview, 125);
    await setWindowSize({ electronApp, size: defaultWindow });
    await expectZoom(creditNotePreview, 125);
    await creditNotePreview.getByRole("button", { name: "Fit preview" }).click();
    await expectFittedA4Page(creditNotePreview);
  } finally {
    await closeApp(electronApp);
  }
});

type WindowSize = Readonly<{ height: number; width: number }>;
type SetWindowSizeOptions = Readonly<{
  electronApp: ElectronApplication;
  size: WindowSize;
}>;
type ZoomToBoundOptions = Readonly<{
  button: Locator;
  preview: Locator;
  targetPercent: number;
}>;

async function setWindowSize({ electronApp, size }: SetWindowSizeOptions): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, nextSize) => {
    const applicationWindow = BrowserWindow.getAllWindows()[0];
    if (!applicationWindow) throw new Error("Expected the production application window");
    applicationWindow.setSize(nextSize.width, nextSize.height);
  }, size);
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => {
        const applicationWindow = BrowserWindow.getAllWindows()[0];
        if (!applicationWindow) throw new Error("Expected the production application window");
        const [width, height] = applicationWindow.getSize();
        return { height, width };
      }),
    )
    .toEqual(size);
  const page = await electronApp.firstWindow();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function expectGeneratedPdf(preview: Locator): Promise<void> {
  const firstPage = preview.locator(".billing-pdf-preview__page").first();
  await expect(firstPage).toBeVisible();
  await expect(firstPage.locator("canvas")).toBeVisible();
  await expect(firstPage.locator(".textLayer span").first()).toBeAttached();
}

async function expectFittedA4Page(
  preview: Locator,
): Promise<Readonly<{ height: number; width: number }>> {
  const viewport = preview.locator(".billing-pdf-preview__viewport");
  const pdfPage = preview.locator(".billing-pdf-preview__page").first();
  await expect(pdfPage).toBeVisible();
  const [viewportBox, pageBox] = await Promise.all([viewport.boundingBox(), pdfPage.boundingBox()]);
  if (!viewportBox || !pageBox) throw new Error("Expected visible preview geometry");

  expect(pageBox.width).toBeLessThanOrEqual(viewportBox.width - 31);
  expect(pageBox.height).toBeLessThanOrEqual(viewportBox.height - 31);
  expect(pageBox.width / pageBox.height).toBeCloseTo(a4Ratio, 3);
  expect(pageBox.height).toBeLessThanOrEqual(a4HeightPixels + 1);
  expect(
    Math.abs(pageBox.x + pageBox.width / 2 - (viewportBox.x + viewportBox.width / 2)),
  ).toBeLessThan(1);
  return { height: pageBox.height, width: pageBox.width };
}

async function expectScrollableA4Page(
  preview: Locator,
): Promise<Readonly<{ height: number; width: number }>> {
  const viewport = preview.locator(".billing-pdf-preview__viewport");
  const pdfPage = preview.locator(".billing-pdf-preview__page").first();
  const pageBox = await pdfPage.boundingBox();
  if (!pageBox) throw new Error("Expected visible manual preview geometry");
  const overflow = await viewport.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.scrollHeight, JSON.stringify({ overflow, pageBox })).toBeGreaterThan(
    overflow.clientHeight,
  );
  expect(pageBox.width / pageBox.height).toBeCloseTo(a4Ratio, 3);
  return { height: pageBox.height, width: pageBox.width };
}

type TextLayerGeometry = Readonly<{
  height: number;
  leftRatio: number;
  topRatio: number;
  width: number;
}>;

async function readTextLayerGeometry(preview: Locator): Promise<TextLayerGeometry> {
  const page = preview.locator(".billing-pdf-preview__page").first();
  const text = page.locator(".textLayer span").filter({ hasText: "DRAFT INVOICE" }).first();
  const [pageBox, textBox] = await Promise.all([page.boundingBox(), text.boundingBox()]);
  if (!pageBox || !textBox) throw new Error("Expected PDF text-layer geometry");
  expect(textBox.width).toBeGreaterThan(0);
  expect(textBox.height).toBeGreaterThan(0);
  expect(textBox.x).toBeGreaterThanOrEqual(pageBox.x);
  expect(textBox.y).toBeGreaterThanOrEqual(pageBox.y);
  expect(textBox.x + textBox.width).toBeLessThanOrEqual(pageBox.x + pageBox.width + 1);
  expect(textBox.y + textBox.height).toBeLessThanOrEqual(pageBox.y + pageBox.height + 1);
  return {
    height: textBox.height,
    leftRatio: (textBox.x - pageBox.x) / pageBox.width,
    topRatio: (textBox.y - pageBox.y) / pageBox.height,
    width: textBox.width,
  };
}

async function expectStickyPreview(page: Page, preview: Locator): Promise<void> {
  const scenario = await preview.evaluate((element) => ({
    initialTop: element.getBoundingClientRect().top,
    maximumScrollTop: document.documentElement.scrollHeight - window.innerHeight,
    stickyTop: Number.parseFloat(getComputedStyle(element).top),
  }));
  const firstScrollTop = scenario.initialTop - scenario.stickyTop + 20;
  const secondScrollTop = firstScrollTop + 50;
  expect(scenario.maximumScrollTop).toBeGreaterThan(secondScrollTop);
  await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), firstScrollTop);
  const pinnedTop = await preview.evaluate((element) => element.getBoundingClientRect().top);
  await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), secondScrollTop);
  await expect
    .poll(() =>
      preview.evaluate(
        (element, expectedTop) => Math.abs(element.getBoundingClientRect().top - expectedTop),
        pinnedTop,
      ),
    )
    .toBeLessThan(0.5);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function expectCreditNoteColumns(controls: Locator, preview: Locator): Promise<void> {
  const [controlsBox, previewBox] = await Promise.all([
    controls.boundingBox(),
    preview.boundingBox(),
  ]);
  if (!controlsBox || !previewBox)
    throw new Error("Expected visible credit-note workspace columns");
  expect(Math.abs(controlsBox.y - previewBox.y)).toBeLessThanOrEqual(1);
  expect(previewBox.x).toBeGreaterThan(controlsBox.x + controlsBox.width);
  const [reasonLabelBox, reasonBox, reasonHelpBox, issueDateBox] = await Promise.all([
    controls.getByText("Correction reason", { exact: true }).boundingBox(),
    controls.getByLabel("Correction reason").boundingBox(),
    controls.getByText("Bad debt is not a correction reason.").boundingBox(),
    controls.getByLabel("Credit-note issue date").boundingBox(),
  ]);
  if (!reasonLabelBox || !reasonBox || !reasonHelpBox || !issueDateBox) {
    throw new Error("Expected visible credit-note form fields");
  }
  expect(reasonLabelBox.y + reasonLabelBox.height).toBeLessThan(reasonBox.y);
  expect(reasonHelpBox.y).toBeGreaterThan(reasonBox.y + reasonBox.height);
  expect(Math.abs(reasonBox.width - controlsBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(issueDateBox.width - controlsBox.width)).toBeLessThanOrEqual(1);
}

async function expectToolbarFits(preview: Locator): Promise<void> {
  const toolbar = preview.locator(".preview-toolbar");
  const layout = await toolbar.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
}

async function expectZoom(preview: Locator, percent: number): Promise<void> {
  await expect(preview.getByLabel("Current zoom")).toHaveText(`${percent}%`);
}

async function zoomToBound({ button, preview, targetPercent }: ZoomToBoundOptions): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if ((await preview.getByLabel("Current zoom").textContent()) === `${targetPercent}%`) return;
    await button.click();
  }
  throw new Error(`Could not reach ${targetPercent}% manual zoom`);
}
