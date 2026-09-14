import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  initialWorkspaceState,
  type DatasetArchive,
  type WorkspaceState,
} from "../../application/workspace.js";
import { persistedClientSchema } from "../../domain/clients/client.js";
import { createInvoiceDraft } from "../../domain/invoices/invoice-draft.js";
import { persistedIssuedInvoiceSchema } from "../../domain/invoices/issued-invoice.js";
import { completeClient } from "../../../tests/fixtures/client.js";
import { completeIssuedInvoice } from "../../../tests/fixtures/issued-invoice.js";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.js";
import { createDatasetArchive } from "./dataset-archive.js";
import { defaultDatasetArchiveLimits, encodeDatasetArchive } from "./dataset-archive-codec.js";
import { createWorkspaceRepository } from "./workspace-repository.js";
import { parseWorkspaceState } from "./workspace-state.js";
import { createFaultInjector, type FaultPoint } from "../testing/fault-injection.js";

const temporaryPaths: string[] = [];

describe("dataset archive", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    );
  });

  it("creates and validates one versioned archive with the complete state and referenced PDFs", async () => {
    const userDataPath = await makeTemporaryPath("data");
    const archivePath = join(await makeTemporaryPath("backup"), "invoice-generator-backup.zip");
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const pdfBytes = new TextEncoder().encode("%PDF-1.7\nexact backup bytes\n%%EOF");
    const pdfSha256 = createHash("sha256").update(pdfBytes).digest("hex");
    const invoice = persistedIssuedInvoiceSchema.parse({
      ...completeIssuedInvoice,
      retainedPdf: { filename: "GGIOHK-0043.pdf", sha256: pdfSha256 },
    });
    const workspace = {
      ...initialWorkspaceState,
      clients: [
        persistedClientSchema.parse({
          ...completeClient,
          invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
        }),
      ],
      issuedInvoices: [invoice],
      issuer: completeIssuer,
    };
    await repository.commitRetainedDocument(
      workspace,
      { kind: "issued-invoice", record: invoice },
      { bytes: pdfBytes, pdf: invoice.retainedPdf },
    );
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath,
    });

    await expect(archive.createBackup()).resolves.toEqual({
      kind: "created",
      summary: {
        archiveSchemaVersion: 1,
        clientCount: 1,
        creditNoteCount: 0,
        issuedInvoiceCount: 1,
        pdfFilenames: ["GGIOHK-0043.pdf"],
        workspaceSchemaVersion: 6,
      },
    });
    expect((await readFile(archivePath)).byteLength).toBeGreaterThan(pdfBytes.byteLength);
    await expect(archive.inspectRestore()).resolves.toMatchObject({
      kind: "ready",
      summary: {
        archiveSchemaVersion: 1,
        clientCount: 1,
        creditNoteCount: 0,
        issuedInvoiceCount: 1,
        pdfFilenames: ["GGIOHK-0043.pdf"],
        workspaceSchemaVersion: 6,
      },
    });
  });

  it("replaces the complete dataset with the inspected archive and leaves no prior PDF", async () => {
    const sourceDataPath = await makeTemporaryPath("source-data");
    const targetDataPath = await makeTemporaryPath("target-data");
    const archivePath = join(await makeTemporaryPath("replacement-backup"), "replacement.zip");
    const source = await writeIssuedWorkspace(sourceDataPath, "source PDF bytes");
    const target = await writeIssuedWorkspace(targetDataPath, "old PDF bytes", "OLD-0043.pdf");
    const sourceArchive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(null),
      userDataPath: sourceDataPath,
    });
    await sourceArchive.createBackup();
    const targetArchive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath: targetDataPath,
    });

    const inspection = await requireReadyInspection(targetArchive.inspectRestore());
    await expect(targetArchive.commitRestore(inspection.restoreId)).resolves.toEqual({
      cleanup: "complete",
      kind: "restored",
      state: source.workspace,
    });

    await expect(
      createWorkspaceRepository({ userDataPath: targetDataPath }).load(),
    ).resolves.toEqual(source.workspace);
    await expect(
      readFile(join(targetDataPath, "retained-pdfs", source.invoice.retainedPdf.filename)),
    ).resolves.toEqual(Buffer.from(source.pdfBytes));
    await expect(
      access(join(targetDataPath, "retained-pdfs", target.invoice.retainedPdf.filename)),
    ).rejects.toThrow("ENOENT");
    await expect(readdir(join(targetDataPath, "retained-pdfs"))).resolves.toEqual([
      source.invoice.retainedPdf.filename,
    ]);

    const roundTripArchivePath = join(
      await makeTemporaryPath("round-trip-backup"),
      "round-trip.zip",
    );
    const roundTripArchive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(roundTripArchivePath),
      chooseRestorePath: () => Promise.resolve(roundTripArchivePath),
      userDataPath: targetDataPath,
    });
    await expect(roundTripArchive.createBackup()).resolves.toMatchObject({ kind: "created" });
    await expect(roundTripArchive.inspectRestore()).resolves.toMatchObject({ kind: "ready" });
  });

  it("requires the one-use ID from the latest inspection and invalidates it on cancellation", async () => {
    const sourceDataPath = await makeTemporaryPath("restore-id-source");
    const targetDataPath = await makeTemporaryPath("restore-id-target");
    const archivePath = join(await makeTemporaryPath("restore-id-backup"), "replacement.zip");
    await writeIssuedWorkspace(sourceDataPath, "source PDF bytes");
    await createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(null),
      userDataPath: sourceDataPath,
    }).createBackup();
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath: targetDataPath,
    });

    const firstInspection = await requireReadyInspection(archive.inspectRestore());
    const secondInspection = await requireReadyInspection(archive.inspectRestore());
    expect(secondInspection.restoreId).not.toBe(firstInspection.restoreId);
    await expect(archive.commitRestore(firstInspection.restoreId)).rejects.toThrow(
      "No matching backup archive is ready to restore",
    );

    archive.cancelRestore(secondInspection.restoreId);
    await expect(archive.commitRestore(secondInspection.restoreId)).rejects.toThrow(
      "No matching backup archive is ready to restore",
    );

    const finalInspection = await requireReadyInspection(archive.inspectRestore());
    await expect(archive.commitRestore(finalInspection.restoreId)).resolves.toMatchObject({
      kind: "restored",
    });
    await expect(archive.commitRestore(finalInspection.restoreId)).rejects.toThrow(
      "No matching backup archive is ready to restore",
    );
  });

  it("invalidates an inspected restore when its replacement inspection is invalid", async () => {
    const sourceDataPath = await makeTemporaryPath("invalidated-id-source");
    const targetDataPath = await makeTemporaryPath("invalidated-id-target");
    const outputPath = await makeTemporaryPath("invalidated-id-backup");
    const archivePath = join(outputPath, "replacement.zip");
    const invalidArchivePath = join(outputPath, "invalid.zip");
    let restorePath = archivePath;
    await writeIssuedWorkspace(sourceDataPath, "source PDF bytes");
    await createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(null),
      userDataPath: sourceDataPath,
    }).createBackup();
    await writeFile(invalidArchivePath, "not a ZIP archive");
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(restorePath),
      userDataPath: targetDataPath,
    });

    const inspection = await requireReadyInspection(archive.inspectRestore());
    restorePath = invalidArchivePath;
    await expect(archive.inspectRestore()).rejects.toBeInstanceOf(Error);
    await expect(archive.commitRestore(inspection.restoreId)).rejects.toThrow(
      "No matching backup archive is ready to restore",
    );
  });

  it("atomically replaces a retained PDF when both datasets use the same document filename", async () => {
    const sourceDataPath = await makeTemporaryPath("colliding-source");
    const targetDataPath = await makeTemporaryPath("colliding-target");
    const archivePath = join(await makeTemporaryPath("colliding-backup"), "replacement.zip");
    const source = await writeIssuedWorkspace(sourceDataPath, "replacement PDF bytes");
    await writeIssuedWorkspace(targetDataPath, "current PDF bytes");
    await createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(null),
      userDataPath: sourceDataPath,
    }).createBackup();
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath: targetDataPath,
    });

    const inspection = await requireReadyInspection(archive.inspectRestore());
    await expect(archive.commitRestore(inspection.restoreId)).resolves.toEqual({
      cleanup: "complete",
      kind: "restored",
      state: source.workspace,
    });

    const restoredPath = join(targetDataPath, "retained-pdfs", source.invoice.retainedPdf.filename);
    await expect(readFile(restoredPath)).resolves.toEqual(Buffer.from(source.pdfBytes));
    await expect(readdir(join(targetDataPath, "retained-pdfs"))).resolves.toEqual([
      source.invoice.retainedPdf.filename,
    ]);
  });

  it("restores a schema-valid maximum-length retained PDF filename", async () => {
    const sourceDataPath = await makeTemporaryPath("long-name-source");
    const targetDataPath = await makeTemporaryPath("long-name-target");
    const archivePath = join(await makeTemporaryPath("long-name-backup"), "replacement.zip");
    const maximumInvoiceNumber = `1${"0".repeat(199)}`;
    const maximumFilename = `ABCDEFGHIJKL-${maximumInvoiceNumber}.pdf`;
    const source = await writeIssuedWorkspace(
      sourceDataPath,
      "maximum name PDF bytes",
      maximumFilename,
    );
    await writeIssuedWorkspace(targetDataPath, "current PDF bytes");
    await createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(null),
      userDataPath: sourceDataPath,
    }).createBackup();
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath: targetDataPath,
    });

    const inspection = await requireReadyInspection(archive.inspectRestore());
    await expect(archive.commitRestore(inspection.restoreId)).resolves.toEqual({
      cleanup: "complete",
      kind: "restored",
      state: source.workspace,
    });
    await expect(readFile(join(targetDataPath, "retained-pdfs", maximumFilename))).resolves.toEqual(
      Buffer.from(source.pdfBytes),
    );
  });

  it.each([
    ["corrupt ZIP data", corruptZip],
    ["an unsafe internal path", addUnsafePath],
    ["a prototype path", addPrototypePath],
    ["a missing retained PDF", removeRetainedPdf],
    ["an extra retained PDF", addRetainedPdf],
    ["changed retained PDF bytes", changeRetainedPdf],
    ["changed state", changeState],
    ["a draft whose client is missing", addDraftWithoutClient],
    ["an unsupported archive schema", changeArchiveSchema],
  ])("rejects %s before restore confirmation", async (_caseName, corruptArchive) => {
    const userDataPath = await makeTemporaryPath("invalid-source");
    const archivePath = join(await makeTemporaryPath("invalid-backup"), "invalid.zip");
    await writeIssuedWorkspace(userDataPath, "valid PDF bytes");
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath,
    });
    await archive.createBackup();
    await corruptArchive(archivePath);

    await expect(archive.inspectRestore()).rejects.toBeInstanceOf(Error);
  });

  it("rejects an archive whose central directory exceeds the entry-count limit", async () => {
    const userDataPath = await makeTemporaryPath("entry-limit-data");
    const archivePath = join(await makeTemporaryPath("entry-limit-backup"), "too-many-files.zip");
    await writeFile(
      archivePath,
      zipSync({
        "one.txt": new Uint8Array(),
        "three.txt": new Uint8Array(),
        "two.txt": new Uint8Array(),
      }),
    );
    const archive = createDatasetArchive({
      archiveLimits: {
        maxArchiveBytes: 1_024,
        maxEntryCount: 2,
        maxExpandedBytes: 1_024,
      },
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath,
    });

    await expect(archive.inspectRestore()).rejects.toThrow(
      "The backup archive contains too many files",
    );
  });

  it("rejects an archive whose central directory exceeds the expanded-size limit", async () => {
    const userDataPath = await makeTemporaryPath("expanded-limit-data");
    const archivePath = join(await makeTemporaryPath("expanded-limit-backup"), "too-large.zip");
    await writeFile(archivePath, zipSync({ "large.txt": strToU8("nine bytes") }));
    const archive = createDatasetArchive({
      archiveLimits: {
        maxArchiveBytes: 1_024,
        maxEntryCount: 10,
        maxExpandedBytes: 8,
      },
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath,
    });

    await expect(archive.inspectRestore()).rejects.toThrow(
      "The backup archive expands beyond the supported size",
    );
  });

  it("rejects forged expanded sizes while incrementally inflating an entry", async () => {
    const userDataPath = await makeTemporaryPath("forged-expanded-data");
    const archivePath = join(await makeTemporaryPath("forged-expanded-backup"), "forged.zip");
    const archiveBytes = zipSync({ "large.txt": new Uint8Array(256 * 1_024) });
    forgeExpandedSize(archiveBytes, 1);
    await writeFile(archivePath, archiveBytes);
    const archive = createDatasetArchive({
      archiveLimits: {
        maxArchiveBytes: archiveBytes.byteLength + 1,
        maxEntryCount: 10,
        maxExpandedBytes: 64 * 1_024,
      },
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath,
    });

    await expect(archive.inspectRestore()).rejects.toThrow(
      "The backup archive expands beyond the supported size",
    );
  });

  it("creates a backup when the destination basename is near the filesystem limit", async () => {
    const userDataPath = await makeTemporaryPath("long-backup-source");
    await createWorkspaceRepository({ userDataPath }).load();
    const outputPath = await makeTemporaryPath("long-backup-output");
    const archivePath = join(outputPath, `${"a".repeat(240)}.zip`);
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(archivePath),
      userDataPath,
    });

    await expect(archive.createBackup()).resolves.toMatchObject({ kind: "created" });
    await expect(archive.inspectRestore()).resolves.toMatchObject({ kind: "ready" });
    await expect(readdir(outputPath)).resolves.toEqual([`${"a".repeat(240)}.zip`]);
  });

  it.each(["restore-preparation", "restored-state-commit"] satisfies readonly FaultPoint[])(
    "keeps the current dataset byte-for-byte usable when %s fails",
    async (faultPoint) => {
      const sourceDataPath = await makeTemporaryPath("failed-source");
      const targetDataPath = await makeTemporaryPath("failed-target");
      const archivePath = join(await makeTemporaryPath("failed-backup"), "failed.zip");
      await writeIssuedWorkspace(sourceDataPath, "replacement PDF bytes");
      const target = await writeIssuedWorkspace(
        targetDataPath,
        "current PDF bytes",
        "OLD-0043.pdf",
      );
      await createDatasetArchive({
        chooseBackupPath: () => Promise.resolve(archivePath),
        chooseRestorePath: () => Promise.resolve(null),
        userDataPath: sourceDataPath,
      }).createBackup();
      const stateBefore = await readFile(join(targetDataPath, "state.json"));
      const pdfBefore = await readFile(
        join(targetDataPath, "retained-pdfs", target.invoice.retainedPdf.filename),
      );
      const archive = createDatasetArchive({
        chooseBackupPath: () => Promise.resolve(null),
        chooseRestorePath: () => Promise.resolve(archivePath),
        faultInjector: createFaultInjector([faultPoint]),
        userDataPath: targetDataPath,
      });
      const inspection = await requireReadyInspection(archive.inspectRestore());

      await expect(archive.commitRestore(inspection.restoreId)).rejects.toThrow(
        `Injected failure at ${faultPoint}`,
      );

      await expect(readFile(join(targetDataPath, "state.json"))).resolves.toEqual(stateBefore);
      await expect(
        readFile(join(targetDataPath, "retained-pdfs", target.invoice.retainedPdf.filename)),
      ).resolves.toEqual(pdfBefore);
      await expect(
        createWorkspaceRepository({ userDataPath: targetDataPath }).load(),
      ).resolves.toEqual(target.workspace);
    },
  );

  it("removes every staged candidate when PDF preparation fails part-way through", async () => {
    const sourceDataPath = await makeTemporaryPath("partial-source");
    const targetDataPath = await makeTemporaryPath("partial-target");
    const archivePath = join(await makeTemporaryPath("partial-backup"), "partial.zip");
    await writeIssuedWorkspaceSet(sourceDataPath, [
      ["GGIOHK-0043.pdf", "replacement PDF one"],
      ["GGIOHK-0044.pdf", "replacement PDF two"],
      ["GGIOHK-0045.pdf", "replacement PDF three"],
    ]);
    const target = await writeIssuedWorkspace(targetDataPath, "current PDF bytes", "OLD-0043.pdf");
    await createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(null),
      userDataPath: sourceDataPath,
    }).createBackup();
    const stateBefore = await readFile(join(targetDataPath, "state.json"));
    const pdfBefore = await readFile(
      join(targetDataPath, "retained-pdfs", target.invoice.retainedPdf.filename),
    );
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      faultInjector: createFaultInjector(["restore-pdf-preparation"]),
      userDataPath: targetDataPath,
    });
    const inspection = await requireReadyInspection(archive.inspectRestore());

    await expect(archive.commitRestore(inspection.restoreId)).rejects.toThrow(
      "Injected failure at restore-pdf-preparation",
    );

    await expect(readFile(join(targetDataPath, "state.json"))).resolves.toEqual(stateBefore);
    await expect(
      readFile(join(targetDataPath, "retained-pdfs", target.invoice.retainedPdf.filename)),
    ).resolves.toEqual(pdfBefore);
    await expect(readdir(join(targetDataPath, "retained-pdfs"))).resolves.toEqual([
      target.invoice.retainedPdf.filename,
    ]);
    await expect(access(join(targetDataPath, "state.json.tmp"))).rejects.toThrow("ENOENT");
    await expect(
      createWorkspaceRepository({ userDataPath: targetDataPath }).load(),
    ).resolves.toEqual(target.workspace);
  });

  it("returns the committed state when post-commit PDF cleanup must be retried", async () => {
    const sourceDataPath = await makeTemporaryPath("cleanup-source");
    const targetDataPath = await makeTemporaryPath("cleanup-target");
    const archivePath = join(await makeTemporaryPath("cleanup-backup"), "cleanup.zip");
    const source = await writeIssuedWorkspace(sourceDataPath, "replacement PDF bytes");
    await writeIssuedWorkspace(targetDataPath, "current PDF bytes", "OLD-0043.pdf");
    await createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(archivePath),
      chooseRestorePath: () => Promise.resolve(null),
      userDataPath: sourceDataPath,
    }).createBackup();
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(null),
      chooseRestorePath: () => Promise.resolve(archivePath),
      faultInjector: createFaultInjector(["restored-pdf-cleanup"]),
      userDataPath: targetDataPath,
    });
    const inspection = await requireReadyInspection(archive.inspectRestore());

    await expect(archive.commitRestore(inspection.restoreId)).resolves.toEqual({
      cleanup: "restart-required",
      kind: "restored",
      state: source.workspace,
    });
    await expect(
      createWorkspaceRepository({ userDataPath: targetDataPath }).load(),
    ).resolves.toEqual(source.workspace);
    await expect(readdir(join(targetDataPath, "retained-pdfs"))).resolves.toEqual([
      source.invoice.retainedPdf.filename,
    ]);
  });

  it.each(["backup-creation", "archive-validation"] satisfies readonly FaultPoint[])(
    "reports %s without deleting an unrelated predictable temporary file",
    async (faultPoint) => {
      const userDataPath = await makeTemporaryPath("failed-backup-source");
      await createWorkspaceRepository({ userDataPath }).load();
      const archivePath = join(await makeTemporaryPath("failed-backup-output"), "failed.zip");
      const unrelatedTemporaryPath = `${archivePath}.tmp`;
      await writeFile(unrelatedTemporaryPath, "owned by another operation", { flag: "wx" });
      const archive = createDatasetArchive({
        chooseBackupPath: () => Promise.resolve(archivePath),
        chooseRestorePath: () => Promise.resolve(null),
        faultInjector: createFaultInjector([faultPoint]),
        userDataPath,
      });

      await expect(archive.createBackup()).rejects.toThrow(`Injected failure at ${faultPoint}`);
      await expect(access(archivePath)).rejects.toThrow("ENOENT");
      await expect(readFile(unrelatedTemporaryPath, "utf8")).resolves.toBe(
        "owned by another operation",
      );
      await expect(createWorkspaceRepository({ userDataPath }).load()).resolves.toEqual(
        initialWorkspaceState,
      );
    },
  );

  it("refuses to create a backup inside the live dataset", async () => {
    const userDataPath = await makeTemporaryPath("unsafe-output-source");
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const stateBefore = await readFile(join(userDataPath, "state.json"));
    const archive = createDatasetArchive({
      chooseBackupPath: () => Promise.resolve(join(userDataPath, "state.json")),
      chooseRestorePath: () => Promise.resolve(null),
      userDataPath,
    });

    await expect(archive.createBackup()).rejects.toThrow(
      "A backup cannot be saved inside the live dataset",
    );
    await expect(readFile(join(userDataPath, "state.json"))).resolves.toEqual(stateBefore);
    await expect(repository.load()).resolves.toEqual(initialWorkspaceState);
  });
});

async function corruptZip(path: string): Promise<void> {
  await writeFile(path, "not a ZIP archive");
}

async function addUnsafePath(path: string): Promise<void> {
  await editArchive(path, (entries) => ({ ...entries, "../outside.pdf": strToU8("unsafe") }));
}

async function addPrototypePath(path: string): Promise<void> {
  const entries = new Map(Object.entries(unzipSync(await readFile(path))));
  entries.set("__proto__", strToU8("unexpected prototype entry"));
  await writeFile(path, await encodeDatasetArchive(entries, defaultDatasetArchiveLimits));
}

async function removeRetainedPdf(path: string): Promise<void> {
  await editArchive(path, (entries) => {
    const { "retained-pdfs/GGIOHK-0043.pdf": _removed, ...remainingEntries } = entries;
    return remainingEntries;
  });
}

async function addRetainedPdf(path: string): Promise<void> {
  await editArchive(path, (entries) => ({
    ...entries,
    "retained-pdfs/EXTRA-0001.pdf": strToU8("%PDF-1.7\nextra\n%%EOF"),
  }));
}

async function changeRetainedPdf(path: string): Promise<void> {
  await editArchive(path, (entries) => ({
    ...entries,
    "retained-pdfs/GGIOHK-0043.pdf": strToU8("%PDF-1.7\nchanged\n%%EOF"),
  }));
}

async function changeState(path: string): Promise<void> {
  await editArchive(path, (entries) => {
    const stateJson = strFromU8(requiredTestEntry(entries, "state.json"));
    return {
      ...entries,
      "state.json": strToU8(stateJson.replace("GGIOHK-0043.pdf", "OTHER-0043.pdf")),
    };
  });
}

async function addDraftWithoutClient(path: string): Promise<void> {
  await editArchive(path, (entries) => {
    const state = parseWorkspaceState(strFromU8(requiredTestEntry(entries, "state.json")));
    return {
      ...entries,
      "state.json": strToU8(
        JSON.stringify({
          ...state,
          clients: [],
          draft: { kind: "ordinary", draft: createInvoiceDraft(completeClient) },
        }),
      ),
    };
  });
}

async function changeArchiveSchema(path: string): Promise<void> {
  await editArchive(path, (entries) => {
    const manifestJson = strFromU8(requiredTestEntry(entries, "manifest.json"));
    return {
      ...entries,
      "manifest.json": strToU8(
        manifestJson.replace('"archiveSchemaVersion": 1', '"archiveSchemaVersion": 2'),
      ),
    };
  });
}

async function editArchive(
  path: string,
  edit: (entries: ReturnType<typeof unzipSync>) => ReturnType<typeof unzipSync>,
): Promise<void> {
  const entries = unzipSync(await readFile(path));
  await writeFile(path, zipSync(edit(entries)));
}

function requiredTestEntry(entries: ReturnType<typeof unzipSync>, path: string): Uint8Array {
  const entry = entries[path];
  if (!entry) throw new Error(`Expected ${path} in test archive`);
  return entry;
}

function forgeExpandedSize(archiveBytes: Uint8Array, expandedSize: number): void {
  const view = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength);
  const localHeader = findZipSignature(archiveBytes, 0x04_03_4b_50);
  const centralHeader = findZipSignature(archiveBytes, 0x02_01_4b_50);
  view.setUint32(localHeader + 22, expandedSize, true);
  view.setUint32(centralHeader + 24, expandedSize, true);
}

function findZipSignature(archiveBytes: Uint8Array, signature: number): number {
  const view = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength);
  for (let offset = 0; offset <= archiveBytes.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  throw new Error("Expected ZIP signature in test archive");
}

async function writeIssuedWorkspace(
  userDataPath: string,
  pdfBody: string,
  filename = "GGIOHK-0043.pdf",
) {
  const repository = createWorkspaceRepository({ userDataPath });
  await repository.load();
  const pdfBytes = new TextEncoder().encode(`%PDF-1.7\n${pdfBody}\n%%EOF`);
  const pdfSha256 = createHash("sha256").update(pdfBytes).digest("hex");
  const invoice = persistedIssuedInvoiceSchema.parse({
    ...completeIssuedInvoice,
    id: filename.slice(0, -4),
    invoiceNumber: filename.slice(filename.indexOf("-") + 1, -4).replace(/^0+(?=\d)/u, ""),
    retainedPdf: { filename, sha256: pdfSha256 },
  });
  const workspace = {
    ...initialWorkspaceState,
    clients: [
      persistedClientSchema.parse({
        ...completeClient,
        invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
      }),
    ],
    issuedInvoices: [invoice],
    issuer: completeIssuer,
  };
  await repository.commitRetainedDocument(
    workspace,
    { kind: "issued-invoice", record: invoice },
    { bytes: pdfBytes, pdf: invoice.retainedPdf },
  );
  return { invoice, pdfBytes, workspace };
}

async function writeIssuedWorkspaceSet(
  userDataPath: string,
  pdfs: readonly (readonly [filename: string, body: string])[],
): Promise<WorkspaceState> {
  const retainedDirectory = join(userDataPath, "retained-pdfs");
  const invoices = pdfs.map(([filename, body], index) => {
    const bytes = new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF`);
    return {
      bytes,
      invoice: persistedIssuedInvoiceSchema.parse({
        ...completeIssuedInvoice,
        id: filename.slice(0, -4),
        invoiceNumber: String(43 + index),
        retainedPdf: {
          filename,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      }),
    };
  });
  const workspace: WorkspaceState = {
    ...initialWorkspaceState,
    clients: [
      persistedClientSchema.parse({
        ...completeClient,
        invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "46" },
      }),
    ],
    issuedInvoices: invoices.map(({ invoice }) => invoice),
    issuer: completeIssuer,
  };
  const repository = createWorkspaceRepository({ userDataPath });
  await repository.load();
  for (const { bytes, invoice } of invoices) {
    await repository.commitRetainedDocument(
      workspace,
      { kind: "issued-invoice", record: invoice },
      { bytes, pdf: invoice.retainedPdf },
    );
  }
  await expect(readdir(retainedDirectory)).resolves.toHaveLength(pdfs.length);
  return workspace;
}

async function makeTemporaryPath(name: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), `invoice-generator-${name}-`));
  temporaryPaths.push(path);
  return path;
}

async function requireReadyInspection(inspection: ReturnType<DatasetArchive["inspectRestore"]>) {
  const result = await inspection;
  if (result.kind !== "ready") throw new Error("Expected a ready restore inspection");
  return result;
}
