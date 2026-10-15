import type { Client, ClientId, ClientInput } from "../domain/clients/client.js";
import {
  persistedClientSchema,
  persistedClientsSchema,
  validateClientInput,
} from "../domain/clients/client.js";
import type {
  FullCreditNoteIssueInput,
  FullCreditNoteInput,
} from "../domain/invoices/credit-note.js";
import type { InvoiceDraftInput, InvoiceIssueInput } from "../domain/invoices/invoice-draft.js";
import {
  persistedInvoiceDraftSchema,
  reviewInvoiceDraft,
  type InvoiceDraftReview,
} from "../domain/invoices/invoice-draft.js";
import {
  attachRetainedInvoicePdf,
  createIssuedInvoiceSnapshot,
  type InvoiceId,
} from "../domain/invoices/issued-invoice.js";
import type { DocumentId, RetainedDocument } from "../domain/invoices/retained-document.js";
import {
  createReplacementDraft as copyReplacementDraft,
  replacementDraftHasValidSource,
} from "../domain/invoices/replacement.js";
import type { IssuerSettings } from "../domain/issuer/issuer-settings.js";
import {
  defaultBusinessTimezone,
  type BusinessTimezone,
} from "../domain/issuer/issuer-settings.js";
import type { BusinessDate } from "../domain/time/business-date.js";
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
  PdfPreviewResult,
  RestoreInspectionResult,
  RestoreResult,
  ReplacementDraftCreateResult,
  WorkspaceLoadResult,
} from "./invoice-application-contract.js";
import type { RestoreId } from "./dataset-restore.js";
import { createFullCreditNoteApplication } from "./full-credit-note-application.js";
import { WorkspaceRecoveryError, type WorkspaceRecoveryProblem } from "./workspace-recovery.js";
import type {
  CreditNotePdf,
  DatasetArchive,
  InvoicePdf,
  WorkspaceRepository,
  WorkspaceState,
} from "./workspace.js";

type InvoiceApplicationOptions = Readonly<{
  appVersion: string;
  createClientId: () => string;
  currentBusinessDate: (businessTimezone: BusinessTimezone) => BusinessDate;
  currentTimestamp: () => string;
  creditNotePdf: CreditNotePdf;
  datasetArchive: DatasetArchive;
  invoicePdf: InvoicePdf;
  workspaceRepository: WorkspaceRepository;
}>;

export type InvoiceApplication = Readonly<{
  cancelRestoreBackup: (restoreId: RestoreId) => Promise<void>;
  createBackup: () => Promise<BackupCreateResult>;
  createClient: (input: ClientInput) => Promise<ClientSaveResult>;
  createReplacementDraft: (originalInvoiceId: InvoiceId) => Promise<ReplacementDraftCreateResult>;
  replaceDraftWithReplacement: (
    originalInvoiceId: InvoiceId,
  ) => Promise<ReplacementDraftCreateResult>;
  discardInvoiceDraft: () => Promise<InvoiceDraftDiscardResult>;
  findRetainedDocument: (documentId: DocumentId) => Promise<RetainedDocumentResult>;
  issueFullCreditNote: (input: FullCreditNoteIssueInput) => Promise<FullCreditNoteIssueResult>;
  issueInvoice: (input: InvoiceIssueInput) => Promise<InvoiceIssueResult>;
  loadWorkspace: () => Promise<WorkspaceLoadResult>;
  previewInvoiceDraft: (input: InvoiceDraftInput) => Promise<PdfPreviewResult>;
  previewFullCreditNote: (input: FullCreditNoteInput) => Promise<PdfPreviewResult>;
  inspectRestoreBackup: () => Promise<RestoreInspectionResult>;
  restoreBackup: (restoreId: RestoreId) => Promise<RestoreResult>;
  reviewInvoiceIssue: (input: InvoiceDraftInput) => Promise<InvoiceIssueReviewResult>;
  reviewFullCreditNote: (input: FullCreditNoteInput) => Promise<FullCreditNoteReviewResult>;
  saveInvoiceDraft: (input: InvoiceDraftInput) => Promise<InvoiceDraftSaveResult>;
  saveIssuerSettings: (issuer: IssuerSettings) => Promise<IssuerSettingsSaveResult>;
  updateClient: (clientId: ClientId, input: ClientInput) => Promise<ClientSaveResult>;
}>;

export type RetainedDocumentResult =
  | Readonly<{ kind: "ready"; document: RetainedDocument; path: string }>
  | Readonly<{ kind: "failed"; message: string }>;

type ApplicationState =
  | Readonly<{ kind: "ready"; workspace: WorkspaceState }>
  | Readonly<{ kind: "recovery-required"; problem: WorkspaceRecoveryProblem }>;

type WorkspaceUpdateResult =
  | Readonly<{ kind: "saved" }>
  | Readonly<{ kind: "failed"; message: string }>;

type PreparedClientMutation =
  | Readonly<{ kind: "ready"; client: Client; workspace: WorkspaceState }>
  | Readonly<{ kind: "invalid"; message: string }>;

type UpdatedClientCollection =
  | Readonly<{ kind: "ready"; clients: readonly Client[] }>
  | Readonly<{ kind: "invalid"; message: string }>;

export async function openInvoiceApplication({
  appVersion,
  createClientId,
  creditNotePdf,
  currentBusinessDate,
  currentTimestamp,
  datasetArchive,
  invoicePdf,
  workspaceRepository,
}: InvoiceApplicationOptions): Promise<InvoiceApplication> {
  let applicationState = await loadApplicationState(workspaceRepository);
  const fullCreditNotes = createFullCreditNoteApplication({
    currentBusinessDate,
    currentTimestamp,
    pdf: creditNotePdf,
    workspaceRepository,
  });
  // IPC calls can overlap. Sequence writes so each change starts from the state left by the last.
  let pendingMutation = Promise.resolve();

  async function loadWorkspace(): Promise<WorkspaceLoadResult> {
    await pendingMutation;
    return toWorkspaceLoadResult(applicationState, appVersion, currentBusinessDate);
  }

  function createClient(input: ClientInput): Promise<ClientSaveResult> {
    return saveClient(input, null);
  }

  function createBackup(): Promise<BackupCreateResult> {
    const operation = pendingMutation.then(async (): Promise<BackupCreateResult> => {
      if (applicationState.kind === "recovery-required") {
        return { kind: "failed", message: "The local workspace is unavailable." };
      }
      try {
        return await datasetArchive.createBackup();
      } catch {
        return {
          kind: "failed",
          message: "Could not create the backup. Your current dataset is unchanged.",
        };
      }
    });
    pendingMutation = keepQueueRunning(operation);
    return operation;
  }

  function cancelRestoreBackup(restoreId: RestoreId): Promise<void> {
    const operation = pendingMutation.then(() => datasetArchive.cancelRestore(restoreId));
    pendingMutation = keepQueueRunning(operation);
    return operation;
  }

  function inspectRestoreBackup(): Promise<RestoreInspectionResult> {
    const operation = pendingMutation.then(async (): Promise<RestoreInspectionResult> => {
      try {
        return await datasetArchive.inspectRestore();
      } catch {
        return {
          kind: "invalid",
          message:
            "The selected backup is invalid or incomplete. Your current dataset is unchanged.",
        };
      }
    });
    pendingMutation = keepQueueRunning(operation);
    return operation;
  }

  function restoreBackup(restoreId: RestoreId): Promise<RestoreResult> {
    const operation = pendingMutation.then(async (): Promise<RestoreResult> => {
      try {
        const commitResult = await datasetArchive.commitRestore(restoreId);
        applicationState = { kind: "ready", workspace: commitResult.state };
        return { cleanup: commitResult.cleanup, kind: "restored" };
      } catch {
        return {
          kind: "failed",
          message:
            applicationState.kind === "recovery-required"
              ? "Restore did not replace the blocked dataset. Recovery is still required."
              : "Restore did not replace your current dataset. You can keep using it and try again.",
        };
      }
    });
    pendingMutation = keepQueueRunning(operation);
    return operation;
  }

  async function saveInvoiceDraft(input: InvoiceDraftInput): Promise<InvoiceDraftSaveResult> {
    const result = persistedInvoiceDraftSchema.safeParse(input);
    if (!result.success) return { kind: "invalid", message: "Invoice draft is invalid." };

    const draft = result.data;
    const saveResult = await updateWorkspace((workspace) => ({
      ...workspace,
      draft:
        workspace.draft?.kind === "replacement"
          ? { ...workspace.draft, draft }
          : { kind: "ordinary", draft },
    }));
    return saveResult.kind === "saved"
      ? { kind: "saved", draft }
      : { kind: "failed", message: "Could not save draft." };
  }

  async function discardInvoiceDraft(): Promise<InvoiceDraftDiscardResult> {
    const result = await updateWorkspace((workspace) => ({
      ...workspace,
      draft: null,
    }));
    return result.kind === "saved"
      ? { kind: "discarded" }
      : { kind: "failed", message: "Could not discard draft." };
  }

  function createReplacementDraft(
    originalInvoiceId: InvoiceId,
  ): Promise<ReplacementDraftCreateResult> {
    return saveReplacementDraft(originalInvoiceId, false);
  }

  function replaceDraftWithReplacement(
    originalInvoiceId: InvoiceId,
  ): Promise<ReplacementDraftCreateResult> {
    return saveReplacementDraft(originalInvoiceId, true);
  }

  function saveReplacementDraft(
    originalInvoiceId: InvoiceId,
    replaceExistingDraft: boolean,
  ): Promise<ReplacementDraftCreateResult> {
    const mutation = pendingMutation.then(async (): Promise<ReplacementDraftCreateResult> => {
      if (applicationState.kind === "recovery-required") {
        return { kind: "failed", message: "The local workspace is unavailable." };
      }
      const workspace = applicationState.workspace;
      if (workspace.draft && !replaceExistingDraft) {
        return {
          kind: "conflict",
          message: "Keep or discard the current invoice draft before creating a replacement.",
        };
      }
      const invoice = workspace.issuedInvoices.find(({ id }) => id === originalInvoiceId);
      const creditNote = workspace.creditNotes.find(
        ({ originalInvoiceId: creditedInvoiceId }) => creditedInvoiceId === originalInvoiceId,
      );
      const client = workspace.clients.find(({ id }) => id === invoice?.client.id);
      if (!invoice || !creditNote || !client || !workspace.issuer) {
        return {
          kind: "invalid",
          message: "A replacement requires a fully credited invoice and its current client.",
        };
      }

      try {
        const replacement = copyReplacementDraft({ client, creditNote, invoice });
        const nextWorkspace: WorkspaceState = {
          ...workspace,
          draft: { kind: "replacement", ...replacement },
        };
        await workspaceRepository.save(nextWorkspace);
        applicationState = { kind: "ready", workspace: nextWorkspace };
        return { kind: "created", ...replacement };
      } catch {
        return {
          kind: "failed",
          message: "Could not create the replacement draft. The correction record is unchanged.",
        };
      }
    });
    pendingMutation = keepQueueRunning(mutation);
    return mutation;
  }

  async function reviewInvoiceIssue(input: InvoiceDraftInput): Promise<InvoiceIssueReviewResult> {
    await pendingMutation;
    if (applicationState.kind === "recovery-required") {
      return { kind: "failed", message: "The local workspace is unavailable." };
    }

    const reviewResult = prepareIssueReview(applicationState.workspace, input, currentBusinessDate);
    if (reviewResult.kind === "invalid") return reviewResult;

    try {
      if (!(await invoicePdf.checkFit(reviewResult.review.candidate))) {
        return { kind: "invalid", message: "The invoice does not fit the fixed A4 layout." };
      }
    } catch {
      return { kind: "failed", message: "Could not check the final invoice layout." };
    }

    return {
      kind: "ready",
      candidate: reviewResult.review.candidate,
      warnings: reviewResult.review.warnings,
    };
  }

  async function findRetainedDocument(documentId: DocumentId): Promise<RetainedDocumentResult> {
    await pendingMutation;
    if (applicationState.kind === "recovery-required") {
      return { kind: "failed", message: "The local workspace is unavailable." };
    }
    const invoice = applicationState.workspace.issuedInvoices.find(({ id }) => id === documentId);
    const creditNote = applicationState.workspace.creditNotes.find(({ id }) => id === documentId);
    const document: RetainedDocument | undefined = invoice
      ? { kind: "issued-invoice", record: invoice }
      : creditNote
        ? { kind: "credit-note", record: creditNote }
        : undefined;
    if (!document) return { kind: "failed", message: "The retained document was not found." };
    try {
      return {
        kind: "ready",
        document,
        path: await workspaceRepository.retainedPdfPath(document),
      };
    } catch {
      return { kind: "failed", message: "The retained PDF could not be verified." };
    }
  }

  async function reviewFullCreditNote(
    input: FullCreditNoteInput,
  ): Promise<FullCreditNoteReviewResult> {
    await pendingMutation;
    if (applicationState.kind === "recovery-required") {
      return { kind: "failed", message: "The local workspace is unavailable." };
    }
    return fullCreditNotes.review(applicationState.workspace, input);
  }

  async function previewInvoiceDraft(input: InvoiceDraftInput): Promise<PdfPreviewResult> {
    await pendingMutation;
    if (applicationState.kind === "recovery-required") {
      return { kind: "failed", message: "The local workspace is unavailable." };
    }
    const workspace = applicationState.workspace;
    if (!workspace.issuer) {
      return { kind: "invalid", message: "Complete company settings to preview an invoice." };
    }
    const client = workspace.clients.find(({ id }) => id === input.clientId);
    const review = reviewInvoiceDraft({
      client,
      draft: input,
      issuer: workspace.issuer,
      today: currentBusinessDate(workspace.issuer.businessTimezone),
    });
    try {
      return {
        kind: "ready",
        preview: await invoicePdf.previewDraft(workspace.issuer, review),
      };
    } catch {
      return { kind: "failed", message: "Could not prepare the invoice preview." };
    }
  }

  async function previewFullCreditNote(input: FullCreditNoteInput): Promise<PdfPreviewResult> {
    await pendingMutation;
    if (applicationState.kind === "recovery-required") {
      return { kind: "failed", message: "The local workspace is unavailable." };
    }
    return fullCreditNotes.preview(applicationState.workspace, input);
  }

  function issueFullCreditNote(
    input: FullCreditNoteIssueInput,
  ): Promise<FullCreditNoteIssueResult> {
    const mutation = pendingMutation.then(async (): Promise<FullCreditNoteIssueResult> => {
      if (applicationState.kind === "recovery-required") {
        return { kind: "failed", message: "The local workspace is unavailable." };
      }
      const result = await fullCreditNotes.issue(applicationState.workspace, input.candidate);
      if (result.kind !== "issued") return result;
      applicationState = { kind: "ready", workspace: result.workspace };
      return { kind: "issued", creditNote: result.creditNote };
    });
    pendingMutation = keepQueueRunning(mutation);
    return mutation;
  }

  async function commitReviewedInvoice(
    workspace: WorkspaceState,
    input: InvoiceIssueInput,
    reviewResult: Extract<PreparedIssueReview, { kind: "ready" }>,
  ): Promise<InvoiceIssueResult> {
    try {
      if (!(await invoicePdf.checkFit(reviewResult.review.candidate))) {
        return { kind: "invalid", message: "The invoice does not fit the fixed A4 layout." };
      }

      const snapshot = createIssuedInvoiceSnapshot({
        candidate: reviewResult.review.candidate,
        invoiceNumber: reviewResult.client.invoiceSequence.nextNumber,
        issuedAt: currentTimestamp(),
        lateIssueDateAcknowledged: input.lateIssueDateAcknowledged,
        replacesInvoiceId: workspace.draft?.kind === "replacement" ? workspace.draft.source : null,
      });
      const preparedPdf = await invoicePdf.prepare(snapshot);
      const invoice = attachRetainedInvoicePdf({ pdf: preparedPdf.pdf, snapshot });
      const client = persistedClientSchema.parse({
        ...reviewResult.client,
        invoiceSequence: {
          ...reviewResult.client.invoiceSequence,
          nextNumber: (BigInt(reviewResult.client.invoiceSequence.nextNumber) + 1n).toString(),
        },
      });
      const nextWorkspace: WorkspaceState = {
        ...workspace,
        clients: workspace.clients.map((currentClient) =>
          currentClient.id === client.id ? client : currentClient,
        ),
        draft: null,
        issuedInvoices: [...workspace.issuedInvoices, invoice],
      };
      await workspaceRepository.commitRetainedDocument(
        nextWorkspace,
        { kind: "issued-invoice", record: invoice },
        preparedPdf,
      );
      applicationState = { kind: "ready", workspace: nextWorkspace };
      return { kind: "issued", invoice, client };
    } catch {
      return {
        kind: "failed",
        message: `The invoice was not issued. Your draft is safe, and ${input.expectedInvoiceId} was not used. Review and try again.`,
      };
    }
  }

  function issueInvoice(input: InvoiceIssueInput): Promise<InvoiceIssueResult> {
    const mutation = pendingMutation.then(async (): Promise<InvoiceIssueResult> => {
      if (applicationState.kind === "recovery-required") {
        return { kind: "failed", message: "The local workspace is unavailable." };
      }

      const reviewResult = prepareIssueReview(
        applicationState.workspace,
        input.draft,
        currentBusinessDate,
      );
      if (reviewResult.kind === "invalid") return reviewResult;
      const confirmationError = validateIssueConfirmation(reviewResult, input);
      return (
        confirmationError ?? commitReviewedInvoice(applicationState.workspace, input, reviewResult)
      );
    });
    pendingMutation = keepQueueRunning(mutation);
    return mutation;
  }

  function updateClient(clientId: ClientId, input: ClientInput): Promise<ClientSaveResult> {
    return saveClient(input, clientId);
  }

  function saveClient(
    input: ClientInput,
    currentClientId: ClientId | null,
  ): Promise<ClientSaveResult> {
    const mutation = pendingMutation.then(async (): Promise<ClientSaveResult> => {
      if (applicationState.kind === "recovery-required") {
        return { kind: "failed", message: "The local workspace is unavailable." };
      }

      const preparedMutation = prepareClientMutation(
        applicationState.workspace,
        input,
        currentClientId,
        createClientId,
      );
      if (preparedMutation.kind === "invalid") return preparedMutation;

      try {
        await workspaceRepository.save(preparedMutation.workspace);
      } catch {
        return { kind: "failed", message: "Could not save client details." };
      }

      applicationState = { kind: "ready", workspace: preparedMutation.workspace };
      return { kind: "saved", client: preparedMutation.client };
    });
    pendingMutation = keepQueueRunning(mutation);
    return mutation;
  }

  async function saveIssuerSettings(issuer: IssuerSettings): Promise<IssuerSettingsSaveResult> {
    const result = await updateWorkspace((workspace) => ({ ...workspace, issuer }));
    if (result.kind === "saved") return { kind: "saved", issuer };
    return { kind: "failed", message: "Could not save issuer settings." };
  }

  function updateWorkspace(
    update: (workspace: WorkspaceState) => WorkspaceState,
  ): Promise<WorkspaceUpdateResult> {
    const mutation = pendingMutation.then(async (): Promise<WorkspaceUpdateResult> => {
      if (applicationState.kind === "recovery-required") {
        return { kind: "failed", message: "The local workspace is unavailable." };
      }

      const nextWorkspace = update(applicationState.workspace);
      try {
        await workspaceRepository.save(nextWorkspace);
      } catch {
        return { kind: "failed", message: "Could not save the local workspace." };
      }

      applicationState = { kind: "ready", workspace: nextWorkspace };
      return { kind: "saved" };
    });
    pendingMutation = keepQueueRunning(mutation);
    return mutation;
  }

  return {
    cancelRestoreBackup,
    createBackup,
    createClient,
    createReplacementDraft,
    discardInvoiceDraft,
    findRetainedDocument,
    issueFullCreditNote,
    issueInvoice,
    loadWorkspace,
    inspectRestoreBackup,
    previewFullCreditNote,
    previewInvoiceDraft,
    reviewFullCreditNote,
    reviewInvoiceIssue,
    replaceDraftWithReplacement,
    restoreBackup,
    saveInvoiceDraft,
    saveIssuerSettings,
    updateClient,
  };
}

type PreparedIssueReview =
  | Readonly<{
      kind: "ready";
      client: Client;
      review: InvoiceDraftReview & { candidate: NonNullable<InvoiceDraftReview["candidate"]> };
    }>
  | Readonly<{ kind: "invalid"; message: string }>;

function validateIssueConfirmation(
  reviewResult: Extract<PreparedIssueReview, { kind: "ready" }>,
  input: InvoiceIssueInput,
): Extract<InvoiceIssueResult, { kind: "invalid" }> | null {
  if (reviewResult.review.candidate.proposedInvoiceId !== input.expectedInvoiceId) {
    return {
      kind: "invalid",
      message: "The next invoice number changed. Review the invoice again.",
    };
  }
  if (reviewResult.review.warnings.length > 0 && !input.lateIssueDateAcknowledged) {
    return { kind: "invalid", message: "Confirm that you checked the tax point." };
  }
  return null;
}

function prepareIssueReview(
  workspace: WorkspaceState,
  input: InvoiceDraftInput,
  currentBusinessDate: (businessTimezone: BusinessTimezone) => BusinessDate,
): PreparedIssueReview {
  const draftResult = persistedInvoiceDraftSchema.safeParse(input);
  if (!draftResult.success || !workspace.issuer) {
    return { kind: "invalid", message: "The invoice draft is not ready to issue." };
  }
  const client = workspace.clients.find(({ id }) => id === draftResult.data.clientId);
  const review = reviewInvoiceDraft({
    client,
    draft: draftResult.data,
    issuer: workspace.issuer,
    today: currentBusinessDate(workspace.issuer.businessTimezone),
  });
  if (!client || !review.candidate || review.errors.length > 0) {
    return { kind: "invalid", message: "The invoice draft is not ready to issue." };
  }
  if (workspace.issuedInvoices.some(({ id }) => id === review.candidate?.proposedInvoiceId)) {
    return { kind: "invalid", message: "The next invoice ID is already in use." };
  }
  if (!replacementDraftHasValidSource(workspace)) {
    return { kind: "invalid", message: "The replacement link is no longer valid." };
  }
  return {
    kind: "ready",
    client,
    review: { ...review, candidate: review.candidate },
  };
}

function keepQueueRunning<Result>(mutation: Promise<Result>): Promise<void> {
  // The caller keeps the original promise. This settled copy stops one rejection from blocking
  // every later state change.
  return mutation.then(
    () => undefined,
    () => undefined,
  );
}

function prepareClientMutation(
  workspace: WorkspaceState,
  input: ClientInput,
  currentClientId: ClientId | null,
  createClientId: () => string,
): PreparedClientMutation {
  const validationResult = validateClientInput(input, workspace.clients, currentClientId);
  if (validationResult.kind === "invalid") {
    return {
      kind: "invalid",
      message:
        validationResult.reason === "collision"
          ? "Client prefixes or identifiers are already in use."
          : "Client details are invalid.",
    };
  }

  const clientResult = persistedClientSchema.safeParse({
    id: currentClientId ?? createClientId(),
    ...validationResult.client,
  });
  if (!clientResult.success) return { kind: "invalid", message: "Client details are invalid." };

  const client = clientResult.data;
  const currentClient = workspace.clients.find(({ id }) => id === currentClientId);
  if (
    currentClient &&
    clientHasIssuedInvoice(workspace, currentClient.id) &&
    lockedClientFieldsChanged(currentClient, client)
  ) {
    return {
      kind: "invalid",
      message: "Client identity and invoice sequence are locked after the first invoice.",
    };
  }
  const updatedCollection = updateClientCollection(workspace.clients, client, currentClientId);
  if (updatedCollection.kind === "invalid") return updatedCollection;

  return {
    kind: "ready",
    client,
    workspace: { ...workspace, clients: updatedCollection.clients },
  };
}

function clientHasIssuedInvoice(workspace: WorkspaceState, clientId: ClientId): boolean {
  return workspace.issuedInvoices.some((invoice) => invoice.client.id === clientId);
}

function lockedClientFieldsChanged(currentClient: Client, nextClient: Client): boolean {
  return (
    currentClient.legalName !== nextClient.legalName ||
    currentClient.postalAddress !== nextClient.postalAddress ||
    currentClient.invoiceSequence.prefix !== nextClient.invoiceSequence.prefix ||
    currentClient.invoiceSequence.nextNumber !== nextClient.invoiceSequence.nextNumber
  );
}

function updateClientCollection(
  clients: readonly Client[],
  client: Client,
  currentClientId: ClientId | null,
): UpdatedClientCollection {
  if (currentClientId === null) return parseUpdatedClientCollection([...clients, client]);

  const clientIndex = clients.findIndex(({ id }) => id === currentClientId);
  if (clientIndex === -1) return { kind: "invalid", message: "The client no longer exists." };

  return parseUpdatedClientCollection(
    clients.map((currentClient, index) => (index === clientIndex ? client : currentClient)),
  );
}

function parseUpdatedClientCollection(clients: readonly Client[]): UpdatedClientCollection {
  const result = persistedClientsSchema.safeParse(clients);
  return result.success
    ? { kind: "ready", clients: result.data }
    : { kind: "invalid", message: "Client prefixes or identifiers are already in use." };
}

async function loadApplicationState(
  workspaceRepository: WorkspaceRepository,
): Promise<ApplicationState> {
  try {
    return { kind: "ready", workspace: await workspaceRepository.load() };
  } catch (error) {
    return {
      kind: "recovery-required",
      problem: error instanceof WorkspaceRecoveryError ? error.problem : "unreadable",
    };
  }
}

function toWorkspaceLoadResult(
  applicationState: ApplicationState,
  appVersion: string,
  currentBusinessDate: (businessTimezone: BusinessTimezone) => BusinessDate,
): WorkspaceLoadResult {
  if (applicationState.kind === "recovery-required") {
    return {
      kind: "recovery-required",
      problem: applicationState.problem,
    };
  }

  return {
    kind: "ready",
    workspace: {
      appVersion,
      clients: applicationState.workspace.clients,
      currentBusinessDate: currentBusinessDate(
        applicationState.workspace.issuer?.businessTimezone ?? defaultBusinessTimezone,
      ),
      draft: applicationState.workspace.draft,
      issuedInvoices: applicationState.workspace.issuedInvoices,
      creditNotes: applicationState.workspace.creditNotes,
      issuer: applicationState.workspace.issuer,
    },
  };
}
