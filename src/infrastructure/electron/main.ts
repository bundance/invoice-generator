import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, session } from "electron";
import { z } from "zod";

import {
  openInvoiceApplication,
  type InvoiceApplication,
} from "../../application/invoice-application.js";
import { getBusinessDate } from "../../domain/time/business-date.js";
import { createWorkspaceRepository } from "../persistence/workspace-repository.js";
import { createDatasetArchive } from "../persistence/dataset-archive.js";
import { registerInvoiceAppIpc } from "./invoice-app-ipc.js";
import { createCreditNotePdf, createInvoicePdf } from "./invoice-pdf.js";
import { createFaultInjectorFromJson } from "../testing/fault-injection.js";

let mainWindow: BrowserWindow | null = null;
let openingMainWindow: Promise<void> | null = null;
let invoiceApplication: InvoiceApplication | null = null;
const faultInjector = createFaultInjectorFromJson(process.env.INVOICE_GENERATOR_TEST_FAULTS);

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(ensureMainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void ensureMainWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

function ensureMainWindow(): Promise<void> {
  if (mainWindow) return Promise.resolve();

  openingMainWindow ??= openMainWindow().finally(() => {
    openingMainWindow = null;
  });

  return openingMainWindow;
}

async function openMainWindow(): Promise<void> {
  invoiceApplication ??= await openInvoiceApplication({
    appVersion: getProductVersion(),
    createClientId: randomUUID,
    creditNotePdf: createCreditNotePdf({ faultInjector }),
    currentBusinessDate: (businessTimezone) => getBusinessDate(new Date(), businessTimezone),
    currentTimestamp: () => new Date().toISOString(),
    datasetArchive: createDatasetArchive({
      chooseBackupPath,
      chooseRestorePath,
      faultInjector,
      userDataPath: app.getPath("userData"),
    }),
    invoicePdf: createInvoicePdf({ faultInjector }),
    workspaceRepository: createWorkspaceRepository({
      faultInjector,
      userDataPath: app.getPath("userData"),
    }),
  });
  mainWindow = await createMainWindow(invoiceApplication);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getProductVersion(): string {
  const packageMetadata = z
    .object({ version: z.string() })
    .parse(JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")));
  return packageMetadata.version;
}

async function chooseBackupPath(): Promise<string | null> {
  const window = requireMainWindow();
  const result = await dialog.showSaveDialog(window, {
    defaultPath: `Invoice Generator Backup ${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ extensions: ["zip"], name: "Invoice Generator backup" }],
    title: "Create complete dataset backup",
  });
  return result.canceled ? null : (result.filePath ?? null);
}

async function chooseRestorePath(): Promise<string | null> {
  const window = requireMainWindow();
  const result = await dialog.showOpenDialog(window, {
    filters: [{ extensions: ["zip"], name: "Invoice Generator backup" }],
    properties: ["openFile"],
    title: "Choose a dataset backup to inspect",
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

function requireMainWindow(): BrowserWindow {
  if (!mainWindow) throw new Error("The main window is not available");
  return mainWindow;
}

async function createMainWindow(invoiceApplication: InvoiceApplication): Promise<BrowserWindow> {
  const rendererUrl =
    process.env.VITE_DEV_SERVER_URL ?? pathToFileURL(join(__dirname, "../dist/index.html")).href;
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: "Invoice Generator",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.mjs"),
      sandbox: true,
      webSecurity: true,
    },
  });

  guardWindow(window, rendererUrl);
  registerInvoiceAppIpc({
    faultInjector,
    invoiceApplication,
    quitApplication: () => app.quit(),
    rendererUrl,
    restartApplication,
    window,
  });
  await window.loadURL(rendererUrl);
  window.show();

  return window;
}

function restartApplication(): void {
  app.relaunch();
  app.exit(0);
}

function guardWindow(window: BrowserWindow, rendererUrl: string): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (navigationUrl !== rendererUrl) event.preventDefault();
  });

  if (!process.env.VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
      ({ url }, callback) => {
        recordBlockedNetworkRequest(url);
        callback({ cancel: true });
      },
    );
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function recordBlockedNetworkRequest(url: string): void {
  const networkLogPath = process.env.INVOICE_GENERATOR_TEST_NETWORK_LOG;
  if (networkLogPath) appendFileSync(networkLogPath, `${url}\n`, "utf8");
}
