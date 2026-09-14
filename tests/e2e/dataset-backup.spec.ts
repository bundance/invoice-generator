import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ElectronApplication } from "playwright";

import { initialWorkspaceState } from "../../src/application/workspace.js";
import { persistedClientSchema } from "../../src/domain/clients/client.js";
import { persistedInvoiceDraftSchema } from "../../src/domain/invoices/invoice-draft.js";
import { persistedIssuedInvoiceSchema } from "../../src/domain/invoices/issued-invoice.js";
import { persistedIssuerSettingsSchema } from "../../src/domain/issuer/issuer-settings.js";
import {
  parseWorkspaceState,
  serializeWorkspaceState,
} from "../../src/infrastructure/persistence/workspace-state.js";
import { createWorkspaceRepository } from "../../src/infrastructure/persistence/workspace-repository.js";
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

test("Settings validates, cancels, and completes a whole-dataset restore before issuing", async () => {
  const sourceDataPath = await createUserDataPath("backup-source");
  const targetDataPath = await createUserDataPath("restore-target");
  const outputPath = await createUserDataPath("backup-output");
  const backupPath = join(outputPath, "complete-dataset.zip");
  const corruptPath = join(outputPath, "corrupt.zip");
  const source = await writeSourceDataset(sourceDataPath);
  const targetState = serializeWorkspaceState({
    ...initialWorkspaceState,
    issuer: persistedIssuerSettingsSchema.parse({
      ...completeIssuer,
      legalName: "Prior Dataset Ltd",
    }),
  });
  await writeFile(join(targetDataPath, "state.json"), targetState);
  await writeFile(corruptPath, "not a ZIP archive");
  const sourceApp = await launchProductionApp(sourceDataPath);
  let targetApp: ElectronApplication | null = null;

  try {
    const sourcePage = await sourceApp.firstWindow();
    await sourceApp.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
    }, backupPath);
    await sourcePage
      .getByRole("dialog", { name: "Resume your invoice draft?" })
      .getByRole("button", { name: "Resume draft" })
      .click();
    await sourcePage.getByRole("button", { name: "Settings" }).click();
    await sourcePage.getByRole("button", { name: "Create backup" }).click();
    await expect(sourcePage.getByText("Complete backup created and validated.")).toBeVisible();
    await expect(access(backupPath)).resolves.toBeUndefined();
    await closeApp(sourceApp);

    targetApp = await launchProductionApp(targetDataPath);
    let targetPage = await targetApp.firstWindow();
    await targetPage.getByRole("button", { name: "Settings" }).click();
    await selectRestorePath(targetApp, corruptPath);
    await targetPage.getByRole("button", { name: "Restore backup" }).click();
    await expect(targetPage.getByText(/selected backup is invalid or incomplete/i)).toBeVisible();
    await expect(readFile(join(targetDataPath, "state.json"), "utf8")).resolves.toBe(targetState);

    await selectRestorePath(targetApp, backupPath);
    await targetPage.getByRole("button", { name: "Restore backup" }).click();
    let dialog = targetPage.getByRole("dialog", { name: "Replace the complete dataset?" });
    await expect(dialog).toContainText("Archive schema 1");
    await expect(dialog).toContainText("Workspace schema 6");
    await expect(dialog).toContainText("1 client");
    await expect(dialog).toContainText("1 invoice");
    await expect(dialog).toContainText("GGIOHK-0043.pdf");
    await expect(dialog).toContainText("never merges records");
    await dialog.getByRole("button", { name: "Cancel restore" }).click();
    await expect(readFile(join(targetDataPath, "state.json"), "utf8")).resolves.toBe(targetState);

    await targetPage.getByRole("button", { name: "Restore backup" }).click();
    dialog = targetPage.getByRole("dialog", { name: "Replace the complete dataset?" });
    await dialog.getByRole("button", { name: "Replace complete dataset" }).click();
    targetPage = await targetApp.firstWindow();
    const recoveryDialog = targetPage.getByRole("dialog", { name: "Resume your invoice draft?" });
    await expect(recoveryDialog).toBeVisible();
    expect(await readFile(join(targetDataPath, "state.json"), "utf8")).toBe(source.stateJson);
    const restoredPdfFiles = await readdir(join(targetDataPath, "retained-pdfs"));
    expect(restoredPdfFiles).toEqual(["GGIOHK-0043.pdf"]);
    await expect(
      readFile(join(targetDataPath, "retained-pdfs", restoredPdfFiles[0] ?? "missing")),
    ).resolves.toEqual(source.pdfBytes);

    await recoveryDialog.getByRole("button", { name: "Resume draft" }).click();
    await targetPage.getByRole("button", { name: "Review and issue" }).click();
    const issueDialog = targetPage.getByRole("dialog", { name: "Issue invoice GGIOHK-0044?" });
    await issueDialog.getByRole("button", { name: "Issue GGIOHK-0044" }).click();
    await expect(targetPage.getByRole("article", { name: "Invoice GGIOHK-0044" })).toBeVisible();
    const finalState = parseWorkspaceState(
      await readFile(join(targetDataPath, "state.json"), "utf8"),
    );
    expect(finalState.issuedInvoices.map(({ id }) => id)).toEqual(["GGIOHK-0043", "GGIOHK-0044"]);
  } finally {
    await Promise.allSettled([closeApp(sourceApp), ...(targetApp ? [closeApp(targetApp)] : [])]);
  }
});

test("a committed restore relaunches the app when old PDF cleanup needs a restart", async () => {
  const sourceDataPath = await createUserDataPath("cleanup-reload-source");
  const targetDataPath = await createUserDataPath("cleanup-reload-target");
  const outputPath = await createUserDataPath("cleanup-reload-output");
  const backupPath = join(outputPath, "cleanup-reload.zip");
  const source = await writeSourceDataset(sourceDataPath);
  const sourceApp = await launchProductionApp(sourceDataPath);
  let targetApp: ElectronApplication | null = null;

  try {
    const sourcePage = await sourceApp.firstWindow();
    await sourceApp.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
    }, backupPath);
    await sourcePage
      .getByRole("dialog", { name: "Resume your invoice draft?" })
      .getByRole("button", { name: "Resume draft" })
      .click();
    await sourcePage.getByRole("button", { name: "Settings" }).click();
    await sourcePage.getByRole("button", { name: "Create backup" }).click();
    await expect(sourcePage.getByText("Complete backup created and validated.")).toBeVisible();
    await closeApp(sourceApp);

    targetApp = await launchProductionApp(targetDataPath, ["restored-pdf-cleanup"]);
    const targetPage = await targetApp.firstWindow();
    const retainedPdfDirectory = join(targetDataPath, "retained-pdfs");
    await writeFile(join(retainedPdfDirectory, "OLD-0001.pdf"), "old PDF bytes");
    await targetApp.evaluate(({ app }) => {
      process.env.INVOICE_GENERATOR_TEST_RELAUNCH = "pending";
      app.relaunch = () => {
        process.env.INVOICE_GENERATOR_TEST_RELAUNCH = "relaunch";
      };
      app.exit = (exitCode = 0) => {
        process.env.INVOICE_GENERATOR_TEST_RELAUNCH += `:${exitCode}`;
      };
    });
    await targetPage.getByRole("button", { name: "Settings" }).click();
    await selectRestorePath(targetApp, backupPath);
    await targetPage.getByRole("button", { name: "Restore backup" }).click();
    await targetPage
      .getByRole("dialog", { name: "Replace the complete dataset?" })
      .getByRole("button", { name: "Replace complete dataset" })
      .click();

    await expect
      .poll(() => targetApp?.evaluate(() => process.env.INVOICE_GENERATOR_TEST_RELAUNCH))
      .toBe("relaunch:0");
    await expect(readFile(join(targetDataPath, "state.json"), "utf8")).resolves.toBe(
      source.stateJson,
    );
    await expect(readdir(retainedPdfDirectory)).resolves.toContain("OLD-0001.pdf");
    await createWorkspaceRepository({ userDataPath: targetDataPath }).load();
    await expect(readdir(retainedPdfDirectory)).resolves.toEqual(["GGIOHK-0043.pdf"]);
  } finally {
    await Promise.allSettled([closeApp(sourceApp), ...(targetApp ? [closeApp(targetApp)] : [])]);
  }
});

async function writeSourceDataset(userDataPath: string) {
  const pdfBytes = Buffer.from("%PDF-1.7\nretained source invoice\n%%EOF");
  const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
  const invoice = persistedIssuedInvoiceSchema.parse({
    ...completeIssuedInvoice,
    retainedPdf: { ...completeIssuedInvoice.retainedPdf, sha256 },
  });
  const stateJson = serializeWorkspaceState({
    ...initialWorkspaceState,
    clients: [
      persistedClientSchema.parse({
        ...completeClient,
        invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
      }),
    ],
    draft: {
      kind: "ordinary",
      draft: persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput),
    },
    issuedInvoices: [invoice],
    issuer: completeIssuer,
  });
  await mkdir(join(userDataPath, "retained-pdfs"), { mode: 0o700 });
  await Promise.all([
    writeFile(join(userDataPath, "state.json"), stateJson),
    writeFile(join(userDataPath, "retained-pdfs", invoice.retainedPdf.filename), pdfBytes),
  ]);
  return { pdfBytes, stateJson };
}

async function selectRestorePath(
  electronApp: Awaited<ReturnType<typeof launchProductionApp>>,
  path: string,
): Promise<void> {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selectedPath] });
  }, path);
}
