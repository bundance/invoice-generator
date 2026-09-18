import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Locator } from "@playwright/test";
import type { ElectronApplication } from "playwright";

import { initialWorkspaceState } from "../../src/application/workspace.js";
import { persistedClientSchema } from "../../src/domain/clients/client.js";
import { persistedIssuedInvoiceSchema } from "../../src/domain/invoices/issued-invoice.js";
import { serializeWorkspaceState } from "../../src/infrastructure/persistence/workspace-state.js";
import { completeClient } from "../fixtures/client.js";
import { completeIssuedInvoice } from "../fixtures/issued-invoice.js";
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
const tallWindow = { height: 1200, width: 1440 } as const;
const a4Ratio = 210 / 297;
const a4HeightPixels = (297 / 25.4) * 96;

test("live invoice and credit-note previews fit the available production workspace", async () => {
  test.setTimeout(90_000);
  const userDataPath = await createUserDataPath("live-a4-preview-fit");
  const retainedBytes = Buffer.from("%PDF-1.7\nlive preview fixture\n", "utf8");
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
      issuedInvoices: [historicalInvoice],
      issuer: completeIssuer,
    }),
  );
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    const invoicePreview = page.getByLabel("Invoice preview");
    await expect(invoicePreview).toBeVisible();

    await setWindowSize({ electronApp, size: minimumWindow });
    const minimumInvoice = await expectFittedA4Page(invoicePreview);

    await setWindowSize({ electronApp, size: defaultWindow });
    const defaultInvoice = await expectFittedA4Page(invoicePreview);
    expect(defaultInvoice.height).toBeGreaterThan(minimumInvoice.height);

    await setWindowSize({ electronApp, size: tallWindow });
    const tallInvoice = await expectFittedA4Page(invoicePreview);
    expect(tallInvoice.height).toBeGreaterThan(a4HeightPixels * 0.65);
    expect(tallInvoice.height).toBeLessThanOrEqual(a4HeightPixels + 1);

    await setWindowSize({ electronApp, size: minimumWindow });
    const stickyScenario = await invoicePreview.evaluate((element) => ({
      initialTop: element.getBoundingClientRect().top,
      maximumScrollTop: document.documentElement.scrollHeight - window.innerHeight,
      stickyTop: Number.parseFloat(getComputedStyle(element).top),
    }));
    const firstPinnedScrollTop = stickyScenario.initialTop - stickyScenario.stickyTop + 20;
    const secondPinnedScrollTop = firstPinnedScrollTop + 50;
    expect(firstPinnedScrollTop).toBeGreaterThan(0);
    expect(stickyScenario.maximumScrollTop).toBeGreaterThan(secondPinnedScrollTop);
    await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), firstPinnedScrollTop);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(firstPinnedScrollTop, 0);
    const pinnedPreviewTop = await invoicePreview.evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    expect(pinnedPreviewTop).toBeGreaterThanOrEqual(0);
    await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), secondPinnedScrollTop);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(secondPinnedScrollTop, 0);
    await expect
      .poll(() =>
        invoicePreview.evaluate(
          (element, expectedTop) => Math.abs(element.getBoundingClientRect().top - expectedTop),
          pinnedPreviewTop,
        ),
      )
      .toBeLessThan(0.5);
    await page.evaluate(() => window.scrollTo(0, 0));

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
    await expect(creditNotePreview).toBeVisible();

    await setWindowSize({ electronApp, size: minimumWindow });
    const controls = page.locator(".credit-note-controls");
    const [controlsBox, previewBox] = await Promise.all([
      controls.boundingBox(),
      creditNotePreview.boundingBox(),
    ]);
    if (!controlsBox || !previewBox)
      throw new Error("Expected visible credit-note workspace columns");
    expect(Math.abs(controlsBox.y - previewBox.y)).toBeLessThanOrEqual(1);
    expect(previewBox.x).toBeGreaterThan(controlsBox.x + controlsBox.width);
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
  // Electron reports the new window size before ResizeObserver and React finish the renderer update.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function expectFittedA4Page(
  preview: Locator,
): Promise<Readonly<{ height: number; width: number }>> {
  const viewport = preview.locator(".live-a4-preview-viewport");
  const page = preview.locator(".live-a4-preview-page");
  await expect(page).toBeVisible();
  const [viewportBox, pageBox, pageLayout] = await Promise.all([
    viewport.boundingBox(),
    page.boundingBox(),
    page.evaluate((element) => ({ height: element.clientHeight, width: element.clientWidth })),
  ]);
  if (!viewportBox || !pageBox) throw new Error("Expected visible preview geometry");

  expect(pageBox.width).toBeLessThanOrEqual(viewportBox.width + 1);
  expect(pageBox.height).toBeLessThanOrEqual(viewportBox.height + 1);
  expect(pageBox.width / pageBox.height).toBeCloseTo(a4Ratio, 3);
  expect(pageLayout.width).toBeCloseTo(pageBox.width, 0);
  expect(pageLayout.height).toBeCloseTo(pageBox.height, 0);
  expect(pageBox.height).toBeLessThanOrEqual(a4HeightPixels + 1);
  return { height: pageBox.height, width: pageBox.width };
}
