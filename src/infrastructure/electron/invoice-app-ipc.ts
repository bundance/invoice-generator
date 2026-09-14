import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";

import type { InvoiceApplication } from "../../application/invoice-application.js";
import { restoreIdSchema } from "../../application/dataset-restore.js";
import type {
  BackupCreateResult,
  ClientSaveResult,
  FullCreditNoteIssueResult,
  FullCreditNoteReviewResult,
  InvoiceDraftDiscardResult,
  InvoiceDraftSaveResult,
  InvoiceIssueResult,
  InvoiceIssueReviewResult,
  IssuerSettingsSaveResult,
  ReplacementDraftCreateResult,
  RestoreInspectionResult,
  RestoreResult,
  WorkspaceLoadResult,
} from "../../application/invoice-application-contract.js";
import { clientIdSchema, parseClientInputFields } from "../../domain/clients/client.js";
import {
  parseFullCreditNoteInput,
  parseFullCreditNoteIssueInput,
} from "../../domain/invoices/credit-note.js";
import {
  parseInvoiceDraftInput,
  parseInvoiceIssueInput,
} from "../../domain/invoices/invoice-draft.js";
import { parseInvoiceId } from "../../domain/invoices/issued-invoice.js";
import { parseIssuerSettingsInput } from "../../domain/issuer/issuer-settings.js";
import {
  cancelRestoreBackupChannel,
  createClientChannel,
  createBackupChannel,
  createReplacementDraftChannel,
  discardInvoiceDraftChannel,
  issueInvoiceChannel,
  issueFullCreditNoteChannel,
  loadWorkspaceChannel,
  inspectRestoreBackupChannel,
  restoreBackupChannel,
  quitApplicationChannel,
  replaceDraftWithReplacementChannel,
  reviewInvoiceIssueChannel,
  reviewFullCreditNoteChannel,
  saveInvoiceDraftChannel,
  saveIssuerSettingsChannel,
  updateClientChannel,
} from "./invoice-app-channels.js";
import { registerRetainedDocumentIpc } from "./retained-document-ipc.js";
import type { FaultInjector } from "../testing/fault-injection.js";

type RegisterInvoiceAppIpcOptions = Readonly<{
  faultInjector: FaultInjector;
  invoiceApplication: InvoiceApplication;
  quitApplication: () => void;
  rendererUrl: string;
  restartApplication: () => void;
  window: BrowserWindow;
}>;

export function registerInvoiceAppIpc({
  faultInjector,
  invoiceApplication,
  quitApplication,
  rendererUrl,
  restartApplication,
  window,
}: RegisterInvoiceAppIpcOptions): void {
  ipcMain.removeHandler(cancelRestoreBackupChannel);
  ipcMain.removeHandler(loadWorkspaceChannel);
  ipcMain.removeHandler(createBackupChannel);
  ipcMain.removeHandler(createReplacementDraftChannel);
  ipcMain.removeHandler(replaceDraftWithReplacementChannel);
  ipcMain.removeHandler(inspectRestoreBackupChannel);
  ipcMain.removeHandler(restoreBackupChannel);
  ipcMain.removeHandler(quitApplicationChannel);
  ipcMain.removeHandler(issueInvoiceChannel);
  ipcMain.removeHandler(issueFullCreditNoteChannel);
  ipcMain.removeHandler(reviewInvoiceIssueChannel);
  ipcMain.removeHandler(reviewFullCreditNoteChannel);
  ipcMain.removeHandler(discardInvoiceDraftChannel);
  ipcMain.removeHandler(saveInvoiceDraftChannel);
  ipcMain.removeHandler(saveIssuerSettingsChannel);
  ipcMain.removeHandler(createClientChannel);
  ipcMain.removeHandler(updateClientChannel);

  function rejectUntrustedSender(event: IpcMainInvokeEvent): void {
    if (event.sender !== window.webContents || event.senderFrame?.url !== rendererUrl) {
      throw new Error("The workspace request came from an untrusted page");
    }
  }

  function createClient(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<ClientSaveResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("createClient requires one client input");
    try {
      return invoiceApplication.createClient(parseClientInputFields(inputs[0]));
    } catch {
      return Promise.resolve({ kind: "invalid", message: "Client details are invalid." });
    }
  }

  function updateClient(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<ClientSaveResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 2) throw new Error("updateClient requires an ID and client input");
    try {
      return invoiceApplication.updateClient(
        clientIdSchema.parse(inputs[0]),
        parseClientInputFields(inputs[1]),
      );
    } catch {
      return Promise.resolve({ kind: "invalid", message: "Client details are invalid." });
    }
  }

  function loadWorkspace(event: IpcMainInvokeEvent, ...inputs: []): Promise<WorkspaceLoadResult> {
    rejectNoInput(inputs, "loadWorkspace");
    rejectUntrustedSender(event);
    return invoiceApplication.loadWorkspace();
  }

  function createBackup(event: IpcMainInvokeEvent, ...inputs: []): Promise<BackupCreateResult> {
    rejectNoInput(inputs, "createBackup");
    rejectUntrustedSender(event);
    return invoiceApplication.createBackup();
  }

  function createReplacementDraft(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<ReplacementDraftCreateResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("createReplacementDraft requires one invoice ID");
    try {
      return invoiceApplication.createReplacementDraft(parseInvoiceId(inputs[0]));
    } catch {
      return Promise.resolve({ kind: "invalid", message: "The invoice ID is invalid." });
    }
  }

  function replaceDraftWithReplacement(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<ReplacementDraftCreateResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) {
      throw new Error("replaceDraftWithReplacement requires one invoice ID");
    }
    try {
      return invoiceApplication.replaceDraftWithReplacement(parseInvoiceId(inputs[0]));
    } catch {
      return Promise.resolve({ kind: "invalid", message: "The invoice ID is invalid." });
    }
  }

  function cancelRestoreBackup(event: IpcMainInvokeEvent, ...inputs: unknown[]): Promise<void> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("cancelRestoreBackup requires one restore ID");
    return invoiceApplication.cancelRestoreBackup(restoreIdSchema.parse(inputs[0]));
  }

  function inspectRestoreBackup(
    event: IpcMainInvokeEvent,
    ...inputs: []
  ): Promise<RestoreInspectionResult> {
    rejectNoInput(inputs, "inspectRestoreBackup");
    rejectUntrustedSender(event);
    return invoiceApplication.inspectRestoreBackup();
  }

  async function restoreBackup(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<RestoreResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("restoreBackup requires one restore ID");
    const result = await invoiceApplication.restoreBackup(restoreIdSchema.parse(inputs[0]));
    if (result.kind === "restored") {
      setTimeout(() => {
        if (result.cleanup === "complete") window.webContents.reload();
        else restartApplication();
      }, 0);
    }
    return result;
  }

  function quit(event: IpcMainInvokeEvent, ...inputs: []): void {
    rejectNoInput(inputs, "quitApplication");
    rejectUntrustedSender(event);
    setTimeout(quitApplication, 0);
  }

  function saveInvoiceDraft(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<InvoiceDraftSaveResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("saveInvoiceDraft requires one draft input");
    try {
      return invoiceApplication.saveInvoiceDraft(parseInvoiceDraftInput(inputs[0]));
    } catch {
      return Promise.resolve({ kind: "invalid", message: "Invoice draft is invalid." });
    }
  }

  function reviewInvoiceIssue(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<InvoiceIssueReviewResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("reviewInvoiceIssue requires one draft input");
    try {
      return invoiceApplication.reviewInvoiceIssue(parseInvoiceDraftInput(inputs[0]));
    } catch {
      return Promise.resolve({
        kind: "invalid",
        message: "The invoice draft is not ready to issue.",
      });
    }
  }

  function issueInvoice(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<InvoiceIssueResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("issueInvoice requires one issue input");
    try {
      return invoiceApplication.issueInvoice(parseInvoiceIssueInput(inputs[0]));
    } catch {
      return Promise.resolve({
        kind: "invalid",
        message: "The invoice draft is not ready to issue.",
      });
    }
  }

  function reviewFullCreditNote(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<FullCreditNoteReviewResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("reviewFullCreditNote requires one credit-note input");
    try {
      return invoiceApplication.reviewFullCreditNote(parseFullCreditNoteInput(inputs[0]));
    } catch {
      return Promise.resolve({ kind: "invalid", message: "The credit note is invalid." });
    }
  }

  function issueFullCreditNote(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<FullCreditNoteIssueResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("issueFullCreditNote requires one issue input");
    try {
      return invoiceApplication.issueFullCreditNote(parseFullCreditNoteIssueInput(inputs[0]));
    } catch {
      return Promise.resolve({ kind: "invalid", message: "The credit note is invalid." });
    }
  }

  function discardInvoiceDraft(
    event: IpcMainInvokeEvent,
    ...inputs: []
  ): Promise<InvoiceDraftDiscardResult> {
    rejectNoInput(inputs, "discardInvoiceDraft");
    rejectUntrustedSender(event);
    return invoiceApplication.discardInvoiceDraft();
  }

  function saveIssuerSettings(
    event: IpcMainInvokeEvent,
    ...inputs: unknown[]
  ): Promise<IssuerSettingsSaveResult> {
    rejectUntrustedSender(event);
    if (inputs.length !== 1) throw new Error("saveIssuerSettings requires one settings input");
    try {
      return invoiceApplication.saveIssuerSettings(parseIssuerSettingsInput(inputs[0]));
    } catch {
      return Promise.resolve({ kind: "invalid", message: "Issuer settings are invalid." });
    }
  }

  ipcMain.handle(loadWorkspaceChannel, loadWorkspace);
  ipcMain.handle(cancelRestoreBackupChannel, cancelRestoreBackup);
  ipcMain.handle(createBackupChannel, createBackup);
  ipcMain.handle(createReplacementDraftChannel, createReplacementDraft);
  ipcMain.handle(replaceDraftWithReplacementChannel, replaceDraftWithReplacement);
  ipcMain.handle(inspectRestoreBackupChannel, inspectRestoreBackup);
  ipcMain.handle(restoreBackupChannel, restoreBackup);
  ipcMain.handle(quitApplicationChannel, quit);
  ipcMain.handle(issueInvoiceChannel, issueInvoice);
  ipcMain.handle(issueFullCreditNoteChannel, issueFullCreditNote);
  ipcMain.handle(reviewInvoiceIssueChannel, reviewInvoiceIssue);
  ipcMain.handle(reviewFullCreditNoteChannel, reviewFullCreditNote);
  ipcMain.handle(discardInvoiceDraftChannel, discardInvoiceDraft);
  ipcMain.handle(saveInvoiceDraftChannel, saveInvoiceDraft);
  ipcMain.handle(saveIssuerSettingsChannel, saveIssuerSettings);
  ipcMain.handle(createClientChannel, createClient);
  ipcMain.handle(updateClientChannel, updateClient);
  registerRetainedDocumentIpc({
    faultInjector,
    invoiceApplication,
    rejectUntrustedSender,
    window,
  });
}

function rejectNoInput(inputs: [], operationName: string): void {
  if (inputs.length > 0) throw new Error(`${operationName} does not accept input`);
}
