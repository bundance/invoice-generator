import { createHash, randomUUID } from "node:crypto";
import { access, chmod, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { strFromU8, strToU8 } from "fflate";
import { z } from "zod";

import { restoreIdSchema, type RestoreId } from "../../application/dataset-restore.js";
import type {
  DatasetArchive,
  DatasetArchiveSummary,
  WorkspaceState,
} from "../../application/workspace.js";
import { noFaultInjector, type FaultInjector } from "../testing/fault-injection.js";
import {
  defaultDatasetArchiveLimits,
  encodeDatasetArchive,
  readDatasetArchive,
  type DatasetArchiveEntries,
  type DatasetArchiveLimits,
} from "./dataset-archive-codec.js";
import {
  removeUnreferencedRetainedPdfArtifacts,
  resolveRetainedPdfPath,
  restoreCandidatePdfFilename,
  verifyRetainedPdf,
} from "./retained-pdf-storage.js";
import { parseWorkspaceState } from "./workspace-state.js";
import { runFileTasks } from "./run-file-tasks.js";

const manifestPath = "manifest.json";
const statePath = "state.json";
const retainedPdfDirectory = "retained-pdfs";
const archiveSchemaVersion = 1;
const manifestSchema = z
  .strictObject({
    archiveSchemaVersion: z.literal(archiveSchemaVersion),
    workspaceSchemaVersion: z.number().int().positive(),
    statePath: z.literal(statePath),
    retainedPdfPaths: z.array(z.string()).readonly(),
  })
  .readonly();
const workspaceVersionSchema = z.object({ schemaVersion: z.number().int().positive() });

type CreateDatasetArchiveOptions = Readonly<{
  archiveLimits?: DatasetArchiveLimits;
  chooseBackupPath: () => Promise<string | null>;
  chooseRestorePath: () => Promise<string | null>;
  faultInjector?: FaultInjector;
  userDataPath: string;
}>;

type ValidatedArchive = Readonly<{
  retainedPdfs: readonly Readonly<{ bytes: Uint8Array; filename: string; sha256: string }>[];
  state: WorkspaceState;
  stateJson: string;
  summary: DatasetArchiveSummary;
}>;

type PreparedFiles = Readonly<{
  installedPdfPaths: readonly string[];
  stateTemporaryPath: string;
}>;

type PreparedRestore = Readonly<{
  archive: ValidatedArchive;
  restoreId: RestoreId;
}>;

export function createDatasetArchive({
  archiveLimits = defaultDatasetArchiveLimits,
  chooseBackupPath,
  chooseRestorePath,
  faultInjector = noFaultInjector,
  userDataPath,
}: CreateDatasetArchiveOptions): DatasetArchive {
  let preparedRestore: PreparedRestore | null = null;

  async function createBackup(): ReturnType<DatasetArchive["createBackup"]> {
    const backupPath = await chooseBackupPath();
    if (!backupPath) return { kind: "cancelled" };
    if (pathIsWithin(userDataPath, backupPath)) {
      throw new Error("A backup cannot be saved inside the live dataset");
    }

    const stateJson = await readFile(join(userDataPath, statePath), "utf8");
    const state = parseWorkspaceState(stateJson);
    const parsedState: unknown = JSON.parse(stateJson);
    const workspaceSchemaVersion = workspaceVersionSchema.parse(parsedState).schemaVersion;
    const retainedPdfPaths = referencedPdfFilenames(state).map(
      (filename) => `${retainedPdfDirectory}/${filename}`,
    );
    const manifest = manifestSchema.parse({
      archiveSchemaVersion,
      retainedPdfPaths,
      statePath,
      workspaceSchemaVersion,
    });
    const entries = new Map<string, Uint8Array>([
      [manifestPath, strToU8(JSON.stringify(manifest, null, 2))],
      [statePath, strToU8(stateJson)],
    ]);
    const documents = [...state.issuedInvoices, ...state.creditNotes];
    for (const { retainedPdf } of documents) {
      entries.set(`${retainedPdfDirectory}/${retainedPdf.filename}`, new Uint8Array());
    }
    await runFileTasks(documents, async ({ retainedPdf }) => {
      const retainedPath = await resolveRetainedPdfPath(userDataPath, retainedPdf);
      entries.set(`${retainedPdfDirectory}/${retainedPdf.filename}`, await readFile(retainedPath));
    });
    const temporaryPath = join(dirname(backupPath), `.invoice-backup-${randomUUID()}.tmp`);
    let ownsTemporaryFile = false;
    try {
      faultInjector.throwIfPlanned("backup-creation");
      const archiveBytes = await encodeDatasetArchive(entries, archiveLimits);
      const temporaryFile = await open(temporaryPath, "wx", 0o600);
      ownsTemporaryFile = true;
      try {
        await temporaryFile.writeFile(archiveBytes);
      } finally {
        await temporaryFile.close();
      }
      const validatedArchive = await validateArchiveFile(
        temporaryPath,
        archiveLimits,
        faultInjector,
      );
      await rename(temporaryPath, backupPath);
      ownsTemporaryFile = false;
      return { kind: "created", summary: validatedArchive.summary };
    } catch (error) {
      if (ownsTemporaryFile) await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async function inspectRestore(): ReturnType<DatasetArchive["inspectRestore"]> {
    preparedRestore = null;
    const restorePath = await chooseRestorePath();
    if (!restorePath) return { kind: "cancelled" };
    const validatedArchive = await validateArchiveFile(restorePath, archiveLimits, faultInjector);
    const restoreId = restoreIdSchema.parse(randomUUID());
    preparedRestore = { archive: validatedArchive, restoreId };
    return { kind: "ready", restoreId, summary: validatedArchive.summary };
  }

  function cancelRestore(restoreId: RestoreId): void {
    if (preparedRestore?.restoreId === restoreId) preparedRestore = null;
  }

  async function commitRestore(restoreId: RestoreId): ReturnType<DatasetArchive["commitRestore"]> {
    if (!preparedRestore || preparedRestore.restoreId !== restoreId) {
      throw new Error("No matching backup archive is ready to restore");
    }
    const archive = preparedRestore.archive;
    preparedRestore = null;
    faultInjector.throwIfPlanned("restore-preparation");
    const preparedFiles = await stageRestore(userDataPath, archive, faultInjector);
    try {
      const cleanupComplete = await replaceDataset(
        userDataPath,
        preparedFiles,
        archive,
        faultInjector,
      );
      return {
        cleanup: cleanupComplete ? "complete" : "restart-required",
        kind: "restored",
        state: archive.state,
      };
    } catch (error) {
      if (await pathExists(preparedFiles.stateTemporaryPath)) {
        await discardPreparedRestore(preparedFiles);
      }
      throw error;
    }
  }

  return { cancelRestore, commitRestore, createBackup, inspectRestore };
}

async function validateArchiveFile(
  archivePath: string,
  archiveLimits: DatasetArchiveLimits,
  faultInjector: FaultInjector,
): Promise<ValidatedArchive> {
  faultInjector.throwIfPlanned("archive-validation");
  const entries = await readDatasetArchive(archivePath, archiveLimits);
  const entryPaths = [...entries.keys()].sort();

  const manifestInput: unknown = JSON.parse(strFromU8(requiredEntry(entries, manifestPath)));
  const manifest = manifestSchema.parse(manifestInput);
  const expectedPaths = [manifestPath, statePath, ...manifest.retainedPdfPaths].sort();
  if (entryPaths.length !== expectedPaths.length || !samePaths(entryPaths, expectedPaths)) {
    throw new Error("The backup archive contains missing or extra files");
  }
  if (!samePaths(manifest.retainedPdfPaths, manifest.retainedPdfPaths.toSorted())) {
    throw new Error("The backup archive PDF list is not canonical");
  }

  const stateJson = strFromU8(requiredEntry(entries, statePath));
  const parsedState: unknown = JSON.parse(stateJson);
  const workspaceSchemaVersion = workspaceVersionSchema.parse(parsedState).schemaVersion;
  if (workspaceSchemaVersion !== manifest.workspaceSchemaVersion) {
    throw new Error("The backup archive schema versions do not match");
  }
  const state = parseWorkspaceState(stateJson);
  const pdfFilenames = referencedPdfFilenames(state);
  const referencedPaths = pdfFilenames.map((filename) => `${retainedPdfDirectory}/${filename}`);
  if (!samePaths(referencedPaths, manifest.retainedPdfPaths)) {
    throw new Error("The backup archive retained-document set does not match its state");
  }
  for (const document of [...state.issuedInvoices, ...state.creditNotes]) {
    const bytes = requiredEntry(
      entries,
      `${retainedPdfDirectory}/${document.retainedPdf.filename}`,
    );
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== document.retainedPdf.sha256) {
      throw new Error("A backup PDF does not match its retained document");
    }
  }

  return {
    retainedPdfs: [...state.issuedInvoices, ...state.creditNotes].map(({ retainedPdf }) => ({
      bytes: requiredEntry(entries, `${retainedPdfDirectory}/${retainedPdf.filename}`),
      filename: retainedPdf.filename,
      sha256: retainedPdf.sha256,
    })),
    state,
    stateJson,
    summary: {
      archiveSchemaVersion,
      clientCount: state.clients.length,
      creditNoteCount: state.creditNotes.length,
      issuedInvoiceCount: state.issuedInvoices.length,
      pdfFilenames,
      workspaceSchemaVersion,
    },
  };
}

async function stageRestore(
  userDataPath: string,
  archive: ValidatedArchive,
  faultInjector: FaultInjector,
): Promise<PreparedFiles> {
  const retainedDirectory = join(userDataPath, retainedPdfDirectory);
  const stateTemporaryPath = join(userDataPath, `${statePath}.tmp`);
  let preparedFiles: PreparedFiles = { installedPdfPaths: [], stateTemporaryPath };
  try {
    await mkdir(retainedDirectory, { mode: 0o700, recursive: true });
    await writeFile(stateTemporaryPath, archive.stateJson, { mode: 0o600 });
    await chmod(stateTemporaryPath, 0o600);
    for (const pdf of archive.retainedPdfs) {
      const installedPdfPath = await prepareRestoredPdf(retainedDirectory, pdf);
      if (installedPdfPath) {
        preparedFiles = {
          installedPdfPaths: [...preparedFiles.installedPdfPaths, installedPdfPath],
          stateTemporaryPath,
        };
      }
      faultInjector.throwIfPlanned("restore-pdf-preparation");
    }
    await verifyPreparedRestore(userDataPath, archive, stateTemporaryPath);
    return preparedFiles;
  } catch (error) {
    await discardPreparedRestore(preparedFiles);
    throw error;
  }
}

async function prepareRestoredPdf(
  retainedDirectory: string,
  pdf: ValidatedArchive["retainedPdfs"][number],
): Promise<string | null> {
  const retainedPath = join(retainedDirectory, restoreCandidatePdfFilename(pdf));
  if (await pathExists(retainedPath)) {
    await verifyRetainedPdf(retainedPath, pdf.sha256);
    return null;
  }

  const temporaryPath = `${retainedPath}.writing`;
  await rm(temporaryPath, { force: true });
  try {
    await writeFile(temporaryPath, pdf.bytes, { flag: "wx", mode: 0o600 });
    await verifyRetainedPdf(temporaryPath, pdf.sha256);
    await rename(temporaryPath, retainedPath);
    return retainedPath;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function verifyPreparedRestore(
  userDataPath: string,
  archive: ValidatedArchive,
  stateTemporaryPath: string,
): Promise<void> {
  const stagedStateJson = await readFile(stateTemporaryPath, "utf8");
  const stagedState = parseWorkspaceState(stagedStateJson);
  if (JSON.stringify(stagedState) !== JSON.stringify(archive.state)) {
    throw new Error("The prepared restore state changed during validation");
  }
  await runFileTasks(
    [...stagedState.issuedInvoices, ...stagedState.creditNotes],
    async (document) => {
      await resolveRetainedPdfPath(userDataPath, document.retainedPdf);
    },
  );
}

async function replaceDataset(
  userDataPath: string,
  preparedFiles: PreparedFiles,
  archive: ValidatedArchive,
  faultInjector: FaultInjector,
): Promise<boolean> {
  const currentStatePath = join(userDataPath, statePath);
  faultInjector.throwIfPlanned("restored-state-commit");
  await rename(preparedFiles.stateTemporaryPath, currentStatePath);
  try {
    faultInjector.throwIfPlanned("restored-pdf-cleanup");
    await removeUnreferencedRetainedPdfArtifacts(userDataPath, archive.state);
    return true;
  } catch {
    return false;
  }
}

async function discardPreparedRestore(preparedFiles: PreparedFiles): Promise<void> {
  await rm(preparedFiles.stateTemporaryPath, { force: true });
  await runFileTasks(preparedFiles.installedPdfPaths, async (path) => {
    await rm(path, { force: true });
  });
}

function referencedPdfFilenames(state: WorkspaceState): readonly string[] {
  return [...state.issuedInvoices, ...state.creditNotes]
    .map(({ retainedPdf }) => retainedPdf.filename)
    .sort();
}

function requiredEntry(entries: DatasetArchiveEntries, path: string): Uint8Array {
  const entry = entries.get(path);
  if (!entry) throw new Error(`The backup archive is missing ${path}`);
  return entry;
}

function samePaths(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((path, index) => path === expected[index])
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function pathIsWithin(parentPath: string, childPath: string): boolean {
  const childFromParent = relative(resolve(parentPath), resolve(childPath));
  return (
    childFromParent === "" ||
    (!isAbsolute(childFromParent) &&
      childFromParent !== ".." &&
      !childFromParent.startsWith(`..${sep}`))
  );
}
