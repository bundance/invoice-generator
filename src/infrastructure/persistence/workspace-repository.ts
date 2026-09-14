import { access, chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  initialWorkspaceState,
  type PreparedDocumentPdf,
  type WorkspaceRepository,
  type WorkspaceState,
} from "../../application/workspace.js";
import { WorkspaceRecoveryError } from "../../application/workspace-recovery.js";
import type { CreditNote, RetainedCreditNotePdf } from "../../domain/invoices/credit-note.js";
import type { IssuedInvoice, RetainedInvoicePdf } from "../../domain/invoices/issued-invoice.js";
import type { RetainedDocument } from "../../domain/invoices/retained-document.js";
import { noFaultInjector, type FaultInjector } from "../testing/fault-injection.js";
import {
  removeUnreferencedRetainedPdfArtifacts,
  resolveRetainedPdfPath,
  retainedPdfArtifactsExist,
  verifyRetainedPdf,
} from "./retained-pdf-storage.js";
import { parseWorkspaceState, serializeWorkspaceState } from "./workspace-state.js";
import { runFileTasks } from "./run-file-tasks.js";

type CreateWorkspaceRepositoryOptions = Readonly<{
  faultInjector?: FaultInjector;
  userDataPath: string;
}>;

export function createWorkspaceRepository({
  faultInjector = noFaultInjector,
  userDataPath,
}: CreateWorkspaceRepositoryOptions): WorkspaceRepository {
  return {
    commitRetainedDocument: (state, document, pdf) =>
      commitRetainedDocument(userDataPath, state, document, pdf, faultInjector),
    load: () => loadWorkspace(userDataPath, faultInjector),
    retainedPdfPath: (document) => getRetainedPdfPath(userDataPath, document),
    save: (state) => saveWorkspace(userDataPath, state, faultInjector),
  };
}

async function commitRetainedDocument(
  userDataPath: string,
  state: WorkspaceState,
  document: RetainedDocument,
  preparedPdf: PreparedDocumentPdf,
  faultInjector: FaultInjector,
): Promise<void> {
  const retainedDocument = findWorkspaceDocument(state, document);
  if (
    !retainedDocument ||
    retainedDocument.retainedPdf.filename !== preparedPdf.pdf.filename ||
    retainedDocument.retainedPdf.sha256 !== preparedPdf.pdf.sha256
  ) {
    throw new Error("The retained document does not reference the prepared PDF");
  }

  await retainPdf(userDataPath, preparedPdf, faultInjector);
  await replaceWorkspaceState(userDataPath, state, faultInjector);
}

async function loadWorkspace(
  userDataPath: string,
  faultInjector: FaultInjector,
): Promise<WorkspaceState> {
  try {
    await mkdir(userDataPath, { mode: 0o700, recursive: true });
  } catch (error) {
    throw new WorkspaceRecoveryError("unreadable", { cause: error });
  }

  const statePath = join(userDataPath, "state.json");
  let state: WorkspaceState;
  try {
    if (await pathEntryExists(statePath)) {
      state = await readWorkspaceState(statePath);
    } else {
      await ensureNoRetainedDocumentsExist(userDataPath);
      state = await createInitialState(userDataPath, faultInjector);
    }
  } catch (error) {
    if (error instanceof WorkspaceRecoveryError) throw error;
    throw new WorkspaceRecoveryError("unreadable", { cause: error });
  }

  try {
    await verifyReferencedRetainedPdfs(userDataPath, state);
  } catch (error) {
    throw new WorkspaceRecoveryError("inconsistent", { cause: error });
  }
  await cleanValidatedWorkspaceArtifacts(userDataPath, state, faultInjector);
  return state;
}

async function cleanValidatedWorkspaceArtifacts(
  userDataPath: string,
  state: WorkspaceState,
  faultInjector: FaultInjector,
): Promise<void> {
  await Promise.allSettled([
    removeTemporaryStateAfterValidation(userDataPath, faultInjector),
    removeUnreferencedRetainedPdfsAfterValidation(userDataPath, state, faultInjector),
  ]);
}

async function removeTemporaryStateAfterValidation(
  userDataPath: string,
  faultInjector: FaultInjector,
): Promise<void> {
  faultInjector.throwIfPlanned("temporary-state-cleanup");
  await removeTemporaryState(userDataPath);
}

async function removeUnreferencedRetainedPdfsAfterValidation(
  userDataPath: string,
  state: WorkspaceState,
  faultInjector: FaultInjector,
): Promise<void> {
  faultInjector.throwIfPlanned("startup-retained-pdf-cleanup");
  await removeUnreferencedRetainedPdfArtifacts(userDataPath, state);
}

async function saveWorkspace(
  userDataPath: string,
  state: WorkspaceState,
  faultInjector: FaultInjector,
): Promise<void> {
  faultInjector.throwIfPlanned("draft-save");
  await replaceWorkspaceState(userDataPath, state, faultInjector);
}

async function retainPdf(
  userDataPath: string,
  { bytes, pdf }: PreparedDocumentPdf,
  faultInjector: FaultInjector,
): Promise<void> {
  const retainedPdfDirectory = join(userDataPath, "retained-pdfs");
  await mkdir(retainedPdfDirectory, { mode: 0o700, recursive: true });
  const retainedPath = join(retainedPdfDirectory, pdf.filename);
  if (await pathExists(retainedPath)) {
    const durablePdf = await findDurableRetainedPdf(userDataPath, pdf.filename);
    if (durablePdf) {
      await verifyRetainedPdf(retainedPath, durablePdf.sha256);
      if (durablePdf.sha256 !== pdf.sha256) {
        throw new Error("The retained document PDF cannot be replaced");
      }
      return;
    }
    await unlink(retainedPath);
  }

  const temporaryPath = `${retainedPath}.tmp`;
  faultInjector.throwIfPlanned("retained-pdf-write");
  await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
  await verifyRetainedPdf(temporaryPath, pdf.sha256);
  await rename(temporaryPath, retainedPath);
}

async function findDurableRetainedPdf(
  userDataPath: string,
  filename: string,
): Promise<RetainedInvoicePdf | RetainedCreditNotePdf | null> {
  const state = await readWorkspaceState(join(userDataPath, "state.json"));
  return (
    state.issuedInvoices.find((invoice) => invoice.retainedPdf.filename === filename)
      ?.retainedPdf ??
    state.creditNotes.find((creditNote) => creditNote.retainedPdf.filename === filename)
      ?.retainedPdf ??
    null
  );
}

async function verifyReferencedRetainedPdfs(
  userDataPath: string,
  state: WorkspaceState,
): Promise<void> {
  await runFileTasks([...state.issuedInvoices, ...state.creditNotes], async (document) => {
    await resolveRetainedPdfPath(userDataPath, document.retainedPdf);
  });
}

async function getRetainedPdfPath(
  userDataPath: string,
  document: RetainedDocument,
): Promise<string> {
  return resolveRetainedPdfPath(userDataPath, document.record.retainedPdf);
}

function findWorkspaceDocument(
  state: WorkspaceState,
  document: RetainedDocument,
): IssuedInvoice | CreditNote | undefined {
  return document.kind === "issued-invoice"
    ? state.issuedInvoices.find(({ id }) => id === document.record.id)
    : state.creditNotes.find(({ id }) => id === document.record.id);
}

async function createInitialState(
  userDataPath: string,
  faultInjector: FaultInjector,
): Promise<WorkspaceState> {
  await replaceWorkspaceState(userDataPath, initialWorkspaceState, faultInjector);
  return initialWorkspaceState;
}

async function replaceWorkspaceState(
  userDataPath: string,
  state: WorkspaceState,
  faultInjector: FaultInjector,
): Promise<void> {
  const temporaryStatePath = join(userDataPath, "state.json.tmp");
  const statePath = join(userDataPath, "state.json");

  faultInjector.throwIfPlanned("temporary-state-write");
  await writeFile(temporaryStatePath, serializeWorkspaceState(state), "utf8");
  await chmod(temporaryStatePath, 0o600);
  faultInjector.throwIfPlanned("candidate-state-validation");
  await readWorkspaceState(temporaryStatePath);
  faultInjector.throwIfPlanned("durable-state-rename");
  await rename(temporaryStatePath, statePath);
}

async function removeTemporaryState(userDataPath: string): Promise<void> {
  const temporaryStatePath = join(userDataPath, "state.json.tmp");
  if (await pathExists(temporaryStatePath)) await unlink(temporaryStatePath);
}

async function readWorkspaceState(statePath: string): Promise<WorkspaceState> {
  const stateJson = await readFile(statePath, "utf8");
  return parseWorkspaceState(stateJson);
}

async function pathEntryExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function ensureNoRetainedDocumentsExist(userDataPath: string): Promise<void> {
  if (await retainedPdfArtifactsExist(userDataPath)) {
    throw new WorkspaceRecoveryError("inconsistent");
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
