import type { Client } from "../domain/clients/client.ts";
import type {
  CreditNote,
  CreditNoteSnapshot,
  FullCreditNoteCandidate,
} from "../domain/invoices/credit-note.ts";
import type {
  InvoiceDraft,
  InvoiceCandidate,
  InvoiceDraftReview,
} from "../domain/invoices/invoice-draft.ts";
import type { IssuedInvoice, IssuedInvoiceSnapshot } from "../domain/invoices/issued-invoice.ts";
import type { RetainedDocument } from "../domain/invoices/retained-document.ts";
import type { ReplacementDraft } from "../domain/invoices/replacement.ts";
import type { IssuerSettings } from "../domain/issuer/issuer-settings.ts";
import type { RestoreCleanup, RestoreId } from "./dataset-restore.ts";

export type WorkspaceDraft =
  | Readonly<{ kind: "ordinary"; draft: InvoiceDraft }>
  | Readonly<{ kind: "replacement" } & ReplacementDraft>;

export type WorkspaceState = Readonly<{
  schemaVersion: 7;
  issuer: IssuerSettings | null;
  clients: readonly Client[];
  draft: WorkspaceDraft | null;
  issuedInvoices: readonly IssuedInvoice[];
  creditNotes: readonly CreditNote[];
  voidedInvoiceNumbers: readonly never[];
}>;

export const initialWorkspaceState: WorkspaceState = {
  schemaVersion: 7,
  issuer: null,
  clients: [],
  draft: null,
  issuedInvoices: [],
  creditNotes: [],
  voidedInvoiceNumbers: [],
};

export type WorkspaceRepository = Readonly<{
  commitRetainedDocument: (
    state: WorkspaceState,
    document: RetainedDocument,
    pdf: PreparedDocumentPdf,
  ) => Promise<void>;
  load: () => Promise<WorkspaceState>;
  retainedPdfPath: (document: RetainedDocument) => Promise<string>;
  save: (state: WorkspaceState) => Promise<void>;
}>;

export type DatasetArchiveSummary = Readonly<{
  archiveSchemaVersion: 1;
  clientCount: number;
  creditNoteCount: number;
  issuedInvoiceCount: number;
  pdfFilenames: readonly string[];
  workspaceSchemaVersion: number;
}>;

export type DatasetRestoreCommitResult = Readonly<{
  cleanup: RestoreCleanup;
  kind: "restored";
  state: WorkspaceState;
}>;

export type DatasetArchive = Readonly<{
  cancelRestore: (restoreId: RestoreId) => void;
  commitRestore: (restoreId: RestoreId) => Promise<DatasetRestoreCommitResult>;
  createBackup: () => Promise<
    Readonly<{ kind: "created"; summary: DatasetArchiveSummary }> | Readonly<{ kind: "cancelled" }>
  >;
  inspectRestore: () => Promise<
    | Readonly<{ kind: "ready"; restoreId: RestoreId; summary: DatasetArchiveSummary }>
    | Readonly<{ kind: "cancelled" }>
  >;
}>;

export type PreparedDocumentPdf = Readonly<{
  bytes: Uint8Array;
  pdf: Readonly<{ filename: string; sha256: string }>;
}>;

export type PdfPreview = Readonly<{
  bytes: Uint8Array;
  documentId: string;
}>;

export type InvoicePdf = Readonly<{
  checkLayout: (candidate: InvoiceCandidate) => Promise<boolean>;
  prepare: (snapshot: IssuedInvoiceSnapshot) => Promise<PreparedDocumentPdf>;
  preview: (issuer: IssuerSettings, review: InvoiceDraftReview) => Promise<PdfPreview>;
}>;

export type CreditNotePdf = Readonly<{
  checkLayout: (candidate: FullCreditNoteCandidate) => Promise<boolean>;
  prepare: (snapshot: CreditNoteSnapshot) => Promise<PreparedDocumentPdf>;
  preview: (candidate: FullCreditNoteCandidate) => Promise<PdfPreview>;
}>;
