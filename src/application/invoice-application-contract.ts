import type { Client, ClientId, ClientInput } from "../domain/clients/client.ts";
import type {
  InvoiceDraft,
  InvoiceDraftInput,
  InvoiceDraftWarning,
  InvoiceIssueInput,
  InvoiceCandidate,
} from "../domain/invoices/invoice-draft.ts";
import type {
  CreditNote,
  FullCreditNoteCandidate,
  FullCreditNoteIssueInput,
  FullCreditNoteInput,
} from "../domain/invoices/credit-note.ts";
import type { InvoiceId, IssuedInvoice } from "../domain/invoices/issued-invoice.ts";
import type { DocumentId } from "../domain/invoices/retained-document.ts";
import type { ReplacementDraft } from "../domain/invoices/replacement.ts";
import type { IssuerSettings, IssuerSettingsInput } from "../domain/issuer/issuer-settings.ts";
import type { BusinessDate } from "../domain/time/business-date.ts";
import type { RestoreCleanup, RestoreId } from "./dataset-restore.ts";
import type { DatasetArchiveSummary, WorkspaceDraft } from "./workspace.ts";
import type { WorkspaceRecoveryProblem } from "./workspace-recovery.ts";

export type WorkspaceSummary = Readonly<{
  appVersion: string;
  clients: readonly Client[];
  currentBusinessDate: BusinessDate;
  draft: WorkspaceDraft | null;
  issuedInvoices: readonly IssuedInvoice[];
  creditNotes: readonly CreditNote[];
  issuer: IssuerSettings | null;
}>;

export type WorkspaceLoadResult =
  | Readonly<{ kind: "ready"; workspace: WorkspaceSummary }>
  | Readonly<{ kind: "recovery-required"; problem: WorkspaceRecoveryProblem }>;

export type IssuerSettingsSaveResult =
  | Readonly<{ kind: "saved"; issuer: IssuerSettings }>
  | Readonly<{ kind: "invalid"; message: string }>
  | Readonly<{ kind: "failed"; message: string }>;

export type ClientSaveResult =
  | Readonly<{ kind: "saved"; client: Client }>
  | Readonly<{ kind: "invalid"; message: string }>
  | Readonly<{ kind: "failed"; message: string }>;

export type InvoiceDraftSaveResult =
  | Readonly<{ kind: "saved"; draft: InvoiceDraft }>
  | Readonly<{ kind: "invalid"; message: string }>
  | Readonly<{ kind: "failed"; message: string }>;

export type InvoiceDraftDiscardResult =
  | Readonly<{ kind: "discarded" }>
  | Readonly<{ kind: "failed"; message: string }>;

export type ReplacementDraftCreateResult =
  | Readonly<{ kind: "created" } & ReplacementDraft>
  | Readonly<{ kind: "conflict" | "invalid" | "failed"; message: string }>;

export type InvoiceIssueReviewResult =
  | Readonly<{
      kind: "ready";
      candidate: InvoiceCandidate;
      warnings: readonly InvoiceDraftWarning[];
    }>
  | Readonly<{ kind: "invalid"; message: string }>
  | Readonly<{ kind: "failed"; message: string }>;

export type InvoiceIssueResult =
  | Readonly<{ kind: "issued"; invoice: IssuedInvoice; client: Client }>
  | Readonly<{ kind: "invalid"; message: string }>
  | Readonly<{ kind: "failed"; message: string }>;

export type FullCreditNoteReviewResult =
  | Readonly<{ kind: "ready"; candidate: FullCreditNoteCandidate }>
  | Readonly<{ kind: "invalid"; message: string }>
  | Readonly<{ kind: "failed"; message: string }>;

export type FullCreditNoteIssueResult =
  | Readonly<{ kind: "issued"; creditNote: CreditNote }>
  | Readonly<{ kind: "invalid"; message: string }>
  | Readonly<{ kind: "failed"; message: string }>;

export type RetainedDocumentActionResult =
  | Readonly<{ kind: "completed" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "failed"; message: string }>;

export type BackupCreateResult =
  | Readonly<{ kind: "created"; summary: DatasetArchiveSummary }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "failed"; message: string }>;

export type RestoreInspectionResult =
  | Readonly<{ kind: "ready"; restoreId: RestoreId; summary: DatasetArchiveSummary }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "invalid"; message: string }>;

export type RestoreResult =
  | Readonly<{ cleanup: RestoreCleanup; kind: "restored" }>
  | Readonly<{ kind: "failed"; message: string }>;

export type InvoiceAppBridge = Readonly<{
  cancelRestoreBackup: (restoreId: RestoreId) => Promise<void>;
  createBackup: () => Promise<BackupCreateResult>;
  createClient: (input: ClientInput) => Promise<ClientSaveResult>;
  createReplacementDraft: (originalInvoiceId: InvoiceId) => Promise<ReplacementDraftCreateResult>;
  replaceDraftWithReplacement: (
    originalInvoiceId: InvoiceId,
  ) => Promise<ReplacementDraftCreateResult>;
  discardInvoiceDraft: () => Promise<InvoiceDraftDiscardResult>;
  loadWorkspace: () => Promise<WorkspaceLoadResult>;
  issueInvoice: (input: InvoiceIssueInput) => Promise<InvoiceIssueResult>;
  issueFullCreditNote: (input: FullCreditNoteIssueInput) => Promise<FullCreditNoteIssueResult>;
  exportRetainedDocument: (documentId: DocumentId) => Promise<RetainedDocumentActionResult>;
  reviewInvoiceIssue: (input: InvoiceDraftInput) => Promise<InvoiceIssueReviewResult>;
  reviewFullCreditNote: (input: FullCreditNoteInput) => Promise<FullCreditNoteReviewResult>;
  openRetainedDocument: (documentId: DocumentId) => Promise<RetainedDocumentActionResult>;
  printRetainedDocument: (documentId: DocumentId) => Promise<RetainedDocumentActionResult>;
  quitApplication: () => Promise<void>;
  inspectRestoreBackup: () => Promise<RestoreInspectionResult>;
  restoreBackup: (restoreId: RestoreId) => Promise<RestoreResult>;
  saveInvoiceDraft: (input: InvoiceDraftInput) => Promise<InvoiceDraftSaveResult>;
  saveIssuerSettings: (input: IssuerSettingsInput) => Promise<IssuerSettingsSaveResult>;
  updateClient: (clientId: ClientId, input: ClientInput) => Promise<ClientSaveResult>;
}>;
