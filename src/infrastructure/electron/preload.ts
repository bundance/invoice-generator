import { contextBridge, ipcRenderer } from "electron";

import {
  type BackupCreateResult,
  type ClientSaveResult,
  type FullCreditNoteIssueResult,
  type FullCreditNoteReviewResult,
  type RetainedDocumentActionResult,
  type InvoiceDraftDiscardResult,
  type InvoiceDraftSaveResult,
  type InvoiceIssueResult,
  type InvoiceIssueReviewResult,
  type InvoiceAppBridge,
  type IssuerSettingsSaveResult,
  type RestoreInspectionResult,
  type RestoreResult,
  type ReplacementDraftCreateResult,
  type WorkspaceLoadResult,
} from "../../application/invoice-application-contract.js";
import type { ClientId, ClientInput } from "../../domain/clients/client.js";
import type {
  FullCreditNoteInput,
  FullCreditNoteIssueInput,
} from "../../domain/invoices/credit-note.js";
import type { DocumentId } from "../../domain/invoices/retained-document.js";
import type { InvoiceId } from "../../domain/invoices/issued-invoice.js";
import type { InvoiceDraftInput } from "../../domain/invoices/invoice-draft.js";
import type { InvoiceIssueInput } from "../../domain/invoices/invoice-draft.js";
import type { IssuerSettingsInput } from "../../domain/issuer/issuer-settings.js";
import type { RestoreId } from "../../application/dataset-restore.js";
import {
  cancelRestoreBackupChannel,
  createClientChannel,
  createBackupChannel,
  createReplacementDraftChannel,
  discardInvoiceDraftChannel,
  exportRetainedDocumentChannel,
  loadWorkspaceChannel,
  inspectRestoreBackupChannel,
  restoreBackupChannel,
  replaceDraftWithReplacementChannel,
  issueInvoiceChannel,
  issueFullCreditNoteChannel,
  openRetainedDocumentChannel,
  printRetainedDocumentChannel,
  quitApplicationChannel,
  reviewInvoiceIssueChannel,
  reviewFullCreditNoteChannel,
  saveInvoiceDraftChannel,
  saveIssuerSettingsChannel,
  updateClientChannel,
} from "./invoice-app-channels.js";

if (!process.contextIsolated || !process.sandboxed) {
  throw new Error("Invoice Generator requires an isolated sandboxed renderer");
}

const invoiceAppBridge = {
  cancelRestoreBackup: (...inputs: [RestoreId]): Promise<void> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("cancelRestoreBackup requires one restore ID"));
    }
    return ipcRenderer.invoke(cancelRestoreBackupChannel, inputs[0]);
  },
  createBackup: (...inputs: []): Promise<BackupCreateResult> => {
    if (inputs.length > 0) {
      return Promise.reject(new Error("createBackup does not accept input"));
    }
    return ipcRenderer.invoke(createBackupChannel);
  },
  createClient: (...inputs: [ClientInput]): Promise<ClientSaveResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("createClient requires one client input"));
    }
    return ipcRenderer.invoke(createClientChannel, inputs[0]);
  },
  createReplacementDraft: (...inputs: [InvoiceId]): Promise<ReplacementDraftCreateResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("createReplacementDraft requires one invoice ID"));
    }
    return ipcRenderer.invoke(createReplacementDraftChannel, inputs[0]);
  },
  replaceDraftWithReplacement: (...inputs: [InvoiceId]): Promise<ReplacementDraftCreateResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("replaceDraftWithReplacement requires one invoice ID"));
    }
    return ipcRenderer.invoke(replaceDraftWithReplacementChannel, inputs[0]);
  },
  discardInvoiceDraft: (...inputs: []): Promise<InvoiceDraftDiscardResult> => {
    if (inputs.length > 0) {
      return Promise.reject(new Error("discardInvoiceDraft does not accept input"));
    }
    return ipcRenderer.invoke(discardInvoiceDraftChannel);
  },
  exportRetainedDocument: (...inputs: [DocumentId]): Promise<RetainedDocumentActionResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("exportRetainedDocument requires one document ID"));
    }
    return ipcRenderer.invoke(exportRetainedDocumentChannel, inputs[0]);
  },
  loadWorkspace: (...inputs: []): Promise<WorkspaceLoadResult> => {
    if (inputs.length > 0) {
      return Promise.reject(new Error("loadWorkspace does not accept input"));
    }

    return ipcRenderer.invoke(loadWorkspaceChannel);
  },
  inspectRestoreBackup: (...inputs: []): Promise<RestoreInspectionResult> => {
    if (inputs.length > 0) {
      return Promise.reject(new Error("inspectRestoreBackup does not accept input"));
    }
    return ipcRenderer.invoke(inspectRestoreBackupChannel);
  },
  issueInvoice: (...inputs: [InvoiceIssueInput]): Promise<InvoiceIssueResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("issueInvoice requires one issue input"));
    }
    return ipcRenderer.invoke(issueInvoiceChannel, inputs[0]);
  },
  issueFullCreditNote: (
    ...inputs: [FullCreditNoteIssueInput]
  ): Promise<FullCreditNoteIssueResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("issueFullCreditNote requires one issue input"));
    }
    return ipcRenderer.invoke(issueFullCreditNoteChannel, inputs[0]);
  },
  openRetainedDocument: (...inputs: [DocumentId]): Promise<RetainedDocumentActionResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("openRetainedDocument requires one document ID"));
    }
    return ipcRenderer.invoke(openRetainedDocumentChannel, inputs[0]);
  },
  printRetainedDocument: (...inputs: [DocumentId]): Promise<RetainedDocumentActionResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("printRetainedDocument requires one document ID"));
    }
    return ipcRenderer.invoke(printRetainedDocumentChannel, inputs[0]);
  },
  quitApplication: (...inputs: []): Promise<void> => {
    if (inputs.length > 0) {
      return Promise.reject(new Error("quitApplication does not accept input"));
    }
    return ipcRenderer.invoke(quitApplicationChannel);
  },
  reviewInvoiceIssue: (...inputs: [InvoiceDraftInput]): Promise<InvoiceIssueReviewResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("reviewInvoiceIssue requires one draft input"));
    }
    return ipcRenderer.invoke(reviewInvoiceIssueChannel, inputs[0]);
  },
  reviewFullCreditNote: (...inputs: [FullCreditNoteInput]): Promise<FullCreditNoteReviewResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("reviewFullCreditNote requires one credit-note input"));
    }
    return ipcRenderer.invoke(reviewFullCreditNoteChannel, inputs[0]);
  },
  restoreBackup: (...inputs: [RestoreId]): Promise<RestoreResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("restoreBackup requires one restore ID"));
    }
    return ipcRenderer.invoke(restoreBackupChannel, inputs[0]);
  },
  saveInvoiceDraft: (...inputs: [InvoiceDraftInput]): Promise<InvoiceDraftSaveResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("saveInvoiceDraft requires one draft input"));
    }
    return ipcRenderer.invoke(saveInvoiceDraftChannel, inputs[0]);
  },
  saveIssuerSettings: (...inputs: [IssuerSettingsInput]): Promise<IssuerSettingsSaveResult> => {
    if (inputs.length !== 1) {
      return Promise.reject(new Error("saveIssuerSettings requires one settings input"));
    }

    return ipcRenderer.invoke(saveIssuerSettingsChannel, inputs[0]);
  },
  updateClient: (...inputs: [ClientId, ClientInput]): Promise<ClientSaveResult> => {
    if (inputs.length !== 2) {
      return Promise.reject(new Error("updateClient requires an ID and client input"));
    }
    return ipcRenderer.invoke(updateClientChannel, inputs[0], inputs[1]);
  },
} satisfies InvoiceAppBridge;

contextBridge.exposeInMainWorld("invoiceApp", Object.freeze(invoiceAppBridge));
