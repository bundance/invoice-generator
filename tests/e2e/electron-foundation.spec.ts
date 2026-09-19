import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  closeApp,
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "./support/electron-test-app.js";

test("fresh production launch creates the fixed local workspace", async () => {
  const userDataPath = await createUserDataPath("workspace");
  await writeFile(join(userDataPath, "state.json.tmp"), "interrupted first launch");
  let electronApp = await launchProductionApp(userDataPath);

  try {
    await electronApp.evaluate(({ app }) => {
      app.emit("activate");
      app.emit("activate");
    });

    const page = await electronApp.firstWindow();
    await expect
      .poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(1);

    await expect(page.getByRole("heading", { level: 1, name: "Create invoice" })).toBeVisible();
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.isVisible(),
      ),
    ).toBe(false);
    await expect(page.getByText("Stored on this Mac")).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Create invoice");
    expect(
      await page.evaluate(
        "performance.getEntriesByType('resource').map(({ name }) => name).filter((name) => /^https?:/.test(name))",
      ),
    ).toEqual([]);

    const paper = await page.locator(".invoice-paper").boundingBox();
    expect(paper?.width && paper.height / paper.width).toBeCloseTo(297 / 210, 2);

    const state = JSON.parse(await readFile(join(userDataPath, "state.json"), "utf8"));
    expect(state).toEqual({
      schemaVersion: 7,
      issuer: null,
      clients: [],
      draft: null,
      issuedInvoices: [],
      creditNotes: [],
      voidedInvoiceNumbers: [],
    });
    expect((await stat(join(userDataPath, "retained-pdfs"))).isDirectory()).toBe(true);
    await expect(access(join(userDataPath, "state.json.tmp"))).rejects.toThrow();

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    await expect(
      (await electronApp.firstWindow()).getByRole("heading", { level: 1, name: "Create invoice" }),
    ).toBeVisible();
  } finally {
    await closeApp(electronApp);
  }
});

test("production launch leaves an invalid existing dataset unchanged", async () => {
  const userDataPath = await createUserDataPath("invalid-workspace");
  const invalidState = '{"schemaVersion":3,"clients":[]}';
  await writeFile(join(userDataPath, "state.json"), invalidState);
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();

    await expect(page.getByRole("heading", { level: 1, name: "Recovery required" })).toBeVisible();
    await expect(page.getByText("Invalid state schema")).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    expect(await readFile(join(userDataPath, "state.json"), "utf8")).toBe(invalidState);
  } finally {
    await closeApp(electronApp);
  }
});

test("production window exposes only the guarded sandboxed workspace bridge", async () => {
  const userDataPath = await createUserDataPath("security");
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    const rendererSandboxed = await electronApp.evaluate(({ app, BrowserWindow }) => {
      const rendererProcessId = BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId();
      return app.getAppMetrics().find(({ pid }) => pid === rendererProcessId)?.sandboxed;
    });

    expect(rendererSandboxed).toBe(true);
    expect(await page.evaluate("Object.keys(window.invoiceApp)")).toEqual([
      "cancelRestoreBackup",
      "createBackup",
      "createClient",
      "createReplacementDraft",
      "replaceDraftWithReplacement",
      "discardInvoiceDraft",
      "exportRetainedDocument",
      "loadWorkspace",
      "inspectRestoreBackup",
      "issueInvoice",
      "issueFullCreditNote",
      "openRetainedDocument",
      "printRetainedDocument",
      "quitApplication",
      "reviewInvoiceIssue",
      "reviewFullCreditNote",
      "restoreBackup",
      "saveInvoiceDraft",
      "saveIssuerSettings",
      "updateClient",
    ]);
    expect(await page.evaluate(() => "process" in globalThis || "require" in globalThis)).toBe(
      false,
    );

    await expect(
      page.evaluate("window.invoiceApp.loadWorkspace('unexpected input')"),
    ).rejects.toThrow(/does not accept input/i);
    await expect(
      page.evaluate("window.invoiceApp.createBackup('unexpected input')"),
    ).rejects.toThrow(/does not accept input/i);
    await expect(
      page.evaluate("window.invoiceApp.inspectRestoreBackup('unexpected input')"),
    ).rejects.toThrow(/does not accept input/i);
    await expect(
      page.evaluate("window.invoiceApp.quitApplication('unexpected input')"),
    ).rejects.toThrow(/does not accept input/i);
    await expect(page.evaluate("window.invoiceApp.cancelRestoreBackup('invalid')")).rejects.toThrow(
      /invalid uuid/i,
    );
    await expect(
      page.evaluate("window.invoiceApp.restoreBackup('unexpected input')"),
    ).rejects.toThrow(/invalid uuid/i);
    expect(await page.evaluate("window.invoiceApp.saveIssuerSettings({})")).toEqual({
      kind: "invalid",
      message: "Issuer settings are invalid.",
    });
    expect(await page.evaluate("window.invoiceApp.createClient({})")).toEqual({
      kind: "invalid",
      message: "Client details are invalid.",
    });
    expect(await page.evaluate("window.invoiceApp.createReplacementDraft('invalid')")).toEqual({
      kind: "invalid",
      message: "The invoice ID is invalid.",
    });
    expect(await page.evaluate("window.invoiceApp.replaceDraftWithReplacement('invalid')")).toEqual(
      {
        kind: "invalid",
        message: "The invoice ID is invalid.",
      },
    );
    expect(await page.evaluate("window.invoiceApp.saveInvoiceDraft({})")).toEqual({
      kind: "invalid",
      message: "Invoice draft is invalid.",
    });
    expect(await page.evaluate("window.invoiceApp.reviewInvoiceIssue({})")).toEqual({
      kind: "invalid",
      message: "The invoice draft is not ready to issue.",
    });
    expect(await page.evaluate("window.invoiceApp.issueInvoice({})")).toEqual({
      kind: "invalid",
      message: "The invoice draft is not ready to issue.",
    });
    expect(await page.evaluate("window.invoiceApp.reviewFullCreditNote({})")).toEqual({
      kind: "invalid",
      message: "The credit note is invalid.",
    });
    expect(await page.evaluate("window.invoiceApp.issueFullCreditNote({})")).toEqual({
      kind: "invalid",
      message: "The credit note is invalid.",
    });
    expect(await page.evaluate("window.invoiceApp.openRetainedDocument('invalid')")).toEqual({
      kind: "failed",
      message: "The document ID is invalid.",
    });
    expect(await page.evaluate("window.invoiceApp.exportRetainedDocument('invalid')")).toEqual({
      kind: "failed",
      message: "The document ID is invalid.",
    });
    expect(await page.evaluate("window.invoiceApp.printRetainedDocument('invalid')")).toEqual({
      kind: "failed",
      message: "The document ID is invalid.",
    });
    await expect(
      page.evaluate("window.invoiceApp.discardInvoiceDraft('unexpected input')"),
    ).rejects.toThrow(/does not accept input/i);
    expect(
      await page.evaluate(
        "window.invoiceApp.updateClient('not-a-client-id', {}).then((result) => result)",
      ),
    ).toEqual({ kind: "invalid", message: "Client details are invalid." });

    const appPath = await electronApp.evaluate(({ app }) => app.getAppPath());
    const preloadPath = join(appPath, "dist-electron/preload.mjs");
    const untrustedSenderResult = await electronApp.evaluate(async ({ BrowserWindow }, preload) => {
      const untrustedWindow = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, preload, sandbox: true },
      });
      await untrustedWindow.loadURL("data:text/html,<main>Untrusted</main>");

      try {
        const loadResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.loadWorkspace()")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const saveResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.saveIssuerSettings({})")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const createClientResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.createClient({})")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const createReplacementResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.createReplacementDraft('GGIOHK-0001')")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const replaceDraftResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.replaceDraftWithReplacement('GGIOHK-0001')")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const updateClientResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.updateClient('not-a-client-id', {})")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const saveDraftResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.saveInvoiceDraft({})")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const discardDraftResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.discardInvoiceDraft()")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const createBackupResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.createBackup()")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const inspectRestoreResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.inspectRestoreBackup()")
          .then(
            () => "allowed",
            () => "rejected",
          );
        const cancelRestoreResult = await untrustedWindow.webContents
          .executeJavaScript(
            "window.invoiceApp.cancelRestoreBackup('7a56ed1d-f110-4f1f-8b80-6064af3f1636')",
          )
          .then(
            () => "allowed",
            () => "rejected",
          );
        const restoreBackupResult = await untrustedWindow.webContents
          .executeJavaScript(
            "window.invoiceApp.restoreBackup('7a56ed1d-f110-4f1f-8b80-6064af3f1636')",
          )
          .then(
            () => "allowed",
            () => "rejected",
          );
        const quitResult = await untrustedWindow.webContents
          .executeJavaScript("window.invoiceApp.quitApplication()")
          .then(
            () => "allowed",
            () => "rejected",
          );
        return {
          cancelRestoreResult,
          createBackupResult,
          createClientResult,
          createReplacementResult,
          discardDraftResult,
          inspectRestoreResult,
          loadResult,
          quitResult,
          restoreBackupResult,
          replaceDraftResult,
          saveDraftResult,
          saveResult,
          updateClientResult,
        };
      } catch {
        return {
          cancelRestoreResult: "rejected",
          createBackupResult: "rejected",
          createClientResult: "rejected",
          createReplacementResult: "rejected",
          discardDraftResult: "rejected",
          inspectRestoreResult: "rejected",
          loadResult: "rejected",
          quitResult: "rejected",
          restoreBackupResult: "rejected",
          replaceDraftResult: "rejected",
          saveDraftResult: "rejected",
          saveResult: "rejected",
          updateClientResult: "rejected",
        };
      } finally {
        untrustedWindow.destroy();
      }
    }, preloadPath);
    expect(untrustedSenderResult).toEqual({
      cancelRestoreResult: "rejected",
      createBackupResult: "rejected",
      createClientResult: "rejected",
      createReplacementResult: "rejected",
      discardDraftResult: "rejected",
      inspectRestoreResult: "rejected",
      loadResult: "rejected",
      quitResult: "rejected",
      restoreBackupResult: "rejected",
      replaceDraftResult: "rejected",
      saveDraftResult: "rejected",
      saveResult: "rejected",
      updateClientResult: "rejected",
    });
  } finally {
    await closeApp(electronApp);
  }
});

test("production shell rejects external navigation and a second writer", async () => {
  const userDataPath = await createUserDataPath("single-instance");
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) externalRequests.push(request.url());
    });

    expect(await page.evaluate("window.open('https://example.com') === null")).toBe(true);
    const trustedUrl = page.url();
    await page.evaluate("window.location.href = 'https://example.com'");
    await expect
      .poll(() =>
        electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.webContents.getURL(),
        ),
      )
      .toBe(trustedUrl);
    expect(externalRequests).toEqual([]);

    const secondProcess = spawn(
      electronApp.process().spawnfile,
      ["dist-electron/main.cjs", `--user-data-dir=${userDataPath}`],
      { stdio: "ignore" },
    );
    const secondExit = once(secondProcess, "exit");
    const exitCode = await Promise.race([
      secondExit.then(([code]) => code),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          secondProcess.kill();
          reject(new Error("The second application instance did not exit"));
        }, 5_000);
      }),
    ]);
    expect(exitCode).toBe(0);
  } finally {
    await closeApp(electronApp);
  }
});
