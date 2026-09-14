import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspaceState } from "../../application/workspace.js";
import { runFileTasks } from "./run-file-tasks.js";

type RetainedPdfReference = Readonly<{ filename: string; sha256: string }>;

export function restoreCandidatePdfFilename(pdf: RetainedPdfReference): string {
  const filenameHash = createHash("sha256").update(pdf.filename).digest("hex");
  return `.restore-${pdf.sha256}-${filenameHash}.pdf.tmp`;
}

export async function resolveRetainedPdfPath(
  userDataPath: string,
  pdf: RetainedPdfReference,
): Promise<string> {
  const retainedPdfDirectory = join(userDataPath, "retained-pdfs");
  const candidatePath = join(retainedPdfDirectory, restoreCandidatePdfFilename(pdf));
  if (await pathExists(candidatePath)) {
    await verifyRetainedPdf(candidatePath, pdf.sha256);
    return candidatePath;
  }

  const originalPath = join(retainedPdfDirectory, pdf.filename);
  await verifyRetainedPdf(originalPath, pdf.sha256);
  return originalPath;
}

export async function verifyRetainedPdf(path: string, expectedSha256: string): Promise<void> {
  const bytes = await readFile(path);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error("A retained PDF does not match its issued invoice");
  }
}

export async function removeUnreferencedRetainedPdfArtifacts(
  userDataPath: string,
  state: WorkspaceState,
): Promise<void> {
  const retainedPdfDirectory = join(userDataPath, "retained-pdfs");
  await mkdir(retainedPdfDirectory, { mode: 0o700, recursive: true });
  await runFileTasks([...state.issuedInvoices, ...state.creditNotes], async ({ retainedPdf }) => {
    await canonicalizeRetainedPdf(retainedPdfDirectory, retainedPdf);
  });
  const referencedFiles = new Set(
    [...state.issuedInvoices, ...state.creditNotes].map(({ retainedPdf }) => retainedPdf.filename),
  );
  const entries = await readdir(retainedPdfDirectory, { withFileTypes: true });
  const staleFiles = entries.filter(
    (entry) =>
      entry.isFile() && isPreparedPdfArtifact(entry.name) && !referencedFiles.has(entry.name),
  );
  await runFileTasks(staleFiles, async (entry) => {
    await unlink(join(retainedPdfDirectory, entry.name));
  });
}

export async function retainedPdfArtifactsExist(userDataPath: string): Promise<boolean> {
  try {
    const entries = await readdir(join(userDataPath, "retained-pdfs"));
    return entries.some(isPreparedPdfArtifact);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function isPreparedPdfArtifact(filename: string): boolean {
  return (
    filename.endsWith(".pdf") || filename.endsWith(".pdf.tmp") || filename.startsWith(".restore-")
  );
}

async function canonicalizeRetainedPdf(
  retainedPdfDirectory: string,
  pdf: RetainedPdfReference,
): Promise<void> {
  const candidatePath = join(retainedPdfDirectory, restoreCandidatePdfFilename(pdf));
  const retainedPath = join(retainedPdfDirectory, pdf.filename);
  if (await pathExists(candidatePath)) {
    await verifyRetainedPdf(candidatePath, pdf.sha256);
    await rename(candidatePath, retainedPath);
  }
  await verifyRetainedPdf(retainedPath, pdf.sha256);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
