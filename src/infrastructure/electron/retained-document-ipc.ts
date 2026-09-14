import { copyFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";

import type {
  InvoiceApplication,
  RetainedDocumentResult,
} from "../../application/invoice-application.js";
import type { RetainedDocumentActionResult } from "../../application/invoice-application-contract.js";
import { parseDocumentId } from "../../domain/invoices/retained-document.js";
import type { FaultInjector, FaultPoint } from "../testing/fault-injection.js";
import {
  exportRetainedDocumentChannel,
  openRetainedDocumentChannel,
  printRetainedDocumentChannel,
} from "./invoice-app-channels.js";

type RegisterRetainedDocumentIpcOptions = Readonly<{
  faultInjector: FaultInjector;
  invoiceApplication: InvoiceApplication;
  rejectUntrustedSender: (event: IpcMainInvokeEvent) => void;
  window: BrowserWindow;
}>;

type DocumentAction = Readonly<{
  action: () => Promise<RetainedDocumentActionResult>;
  failureMessage: string;
  faultPoint: FaultPoint;
}>;

export function registerRetainedDocumentIpc({
  faultInjector,
  invoiceApplication,
  rejectUntrustedSender,
  window,
}: RegisterRetainedDocumentIpcOptions): void {
  ipcMain.removeHandler(exportRetainedDocumentChannel);
  ipcMain.removeHandler(openRetainedDocumentChannel);
  ipcMain.removeHandler(printRetainedDocumentChannel);

  async function runDocumentAction({
    action,
    failureMessage,
    faultPoint,
  }: DocumentAction): Promise<RetainedDocumentActionResult> {
    try {
      faultInjector.throwIfPlanned(faultPoint);
      return await action();
    } catch {
      return { kind: "failed", message: failureMessage };
    }
  }

  async function openRetainedDocument(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<RetainedDocumentActionResult> {
    rejectUntrustedSender(event);
    const retainedDocument = await findRetainedDocument(invoiceApplication, inputs);
    if (retainedDocument.kind === "failed") return retainedDocument;
    const failureMessage = "Could not open the retained PDF.";
    return runDocumentAction({
      action: async () => {
        const openError = await shell.openPath(retainedDocument.path);
        return openError ? { kind: "failed", message: failureMessage } : { kind: "completed" };
      },
      failureMessage,
      faultPoint: "document-open",
    });
  }

  async function exportRetainedDocument(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<RetainedDocumentActionResult> {
    rejectUntrustedSender(event);
    const retainedDocument = await findRetainedDocument(invoiceApplication, inputs);
    if (retainedDocument.kind === "failed") return retainedDocument;
    return runDocumentAction({
      action: () => exportDocument(window, retainedDocument),
      failureMessage: "Could not export the retained PDF.",
      faultPoint: "document-export",
    });
  }

  async function printRetainedDocument(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<RetainedDocumentActionResult> {
    rejectUntrustedSender(event);
    const retainedDocument = await findRetainedDocument(invoiceApplication, inputs);
    if (retainedDocument.kind === "failed") return retainedDocument;
    return runDocumentAction({
      action: () => printRetainedPdf(retainedDocument.path),
      failureMessage: "Could not print the retained PDF.",
      faultPoint: "document-print",
    });
  }

  ipcMain.handle(exportRetainedDocumentChannel, exportRetainedDocument);
  ipcMain.handle(openRetainedDocumentChannel, openRetainedDocument);
  ipcMain.handle(printRetainedDocumentChannel, printRetainedDocument);
}

async function findRetainedDocument(
  invoiceApplication: InvoiceApplication,
  inputs: unknown[],
): Promise<RetainedDocumentResult> {
  if (inputs.length !== 1) throw new Error("A retained document action requires one document ID");
  try {
    return await invoiceApplication.findRetainedDocument(parseDocumentId(inputs[0]));
  } catch {
    return { kind: "failed", message: "The document ID is invalid." };
  }
}

async function exportDocument(
  window: BrowserWindow,
  retainedDocument: Extract<RetainedDocumentResult, { kind: "ready" }>,
): Promise<RetainedDocumentActionResult> {
  const result = await dialog.showSaveDialog(window, {
    defaultPath: retainedDocument.document.record.retainedPdf.filename,
    filters: [{ extensions: ["pdf"], name: "PDF document" }],
  });
  const exportPath = selectedExportPath(result);
  if (!exportPath) return { kind: "cancelled" };
  try {
    await copyFile(retainedDocument.path, exportPath);
    return { kind: "completed" };
  } catch {
    return { kind: "failed", message: "Could not export the retained PDF." };
  }
}

function selectedExportPath(
  result: Readonly<{ canceled: boolean; filePath?: string }>,
): string | null {
  if (result.canceled) return null;
  return result.filePath ?? null;
}

async function printRetainedPdf(path: string): Promise<RetainedDocumentActionResult> {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await printWindow.loadURL(pathToFileURL(path).href);
    return await new Promise((resolve) => {
      printWindow.webContents.print({ printBackground: true, silent: false }, (success) => {
        resolve(
          success
            ? { kind: "completed" }
            : { kind: "failed", message: "The retained PDF was not printed." },
        );
      });
    });
  } catch {
    return { kind: "failed", message: "Could not print the retained PDF." };
  } finally {
    printWindow.destroy();
  }
}
