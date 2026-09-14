import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { initialWorkspaceState, type WorkspaceState } from "../../application/workspace.js";
import { WorkspaceRecoveryError } from "../../application/workspace-recovery.js";
import { persistedClientSchema } from "../../domain/clients/client.js";
import { persistedCreditNoteSchema } from "../../domain/invoices/credit-note.js";
import { persistedInvoiceDraftSchema } from "../../domain/invoices/invoice-draft.js";
import { persistedIssuedInvoiceSchema } from "../../domain/invoices/issued-invoice.js";
import { completeClient } from "../../../tests/fixtures/client.js";
import {
  completeInvoiceDraftInput,
  completeCreditNote,
  completeIssuedInvoice,
} from "../../../tests/fixtures/issued-invoice.js";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.js";
import { createFaultInjector, type FaultPoint } from "../testing/fault-injection.js";
import { createWorkspaceRepository } from "./workspace-repository.js";

const temporaryPaths: string[] = [];

describe("workspace repository", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })),
    );
  });

  it.each([
    ["malformed", "not JSON"],
    ["invalid-schema", JSON.stringify({ schemaVersion: 6, clients: [] })],
    ["newer-version", JSON.stringify({ ...initialWorkspaceState, schemaVersion: 7 })],
    [
      "inconsistent",
      JSON.stringify({
        ...initialWorkspaceState,
        creditNotes: [completeCreditNote],
        issuedInvoices: [],
      }),
    ],
  ] as const)("leaves the whole dataset untouched when state is %s", async (problem, stateJson) => {
    const userDataPath = await createUserDataPath();
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const temporaryStatePath = join(userDataPath, "state.json.tmp");
    const unreferencedPdfPath = join(userDataPath, "retained-pdfs", "UNUSED-0001.pdf");
    await Promise.all([
      writeFile(join(userDataPath, "state.json"), stateJson),
      writeFile(temporaryStatePath, "leave candidate state unchanged"),
      writeFile(unreferencedPdfPath, "leave retained files unchanged"),
    ]);

    await expect(repository.load()).rejects.toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem }),
    );

    await expect(readFile(join(userDataPath, "state.json"), "utf8")).resolves.toBe(stateJson);
    await expect(readFile(temporaryStatePath, "utf8")).resolves.toBe(
      "leave candidate state unchanged",
    );
    await expect(readFile(unreferencedPdfPath, "utf8")).resolves.toBe(
      "leave retained files unchanged",
    );
  });

  it("does not initialize over an unreadable state entry", async () => {
    const userDataPath = await createUserDataPath();
    const statePath = join(userDataPath, "state.json");
    await symlink(join(userDataPath, "missing-state.json"), statePath);
    const repository = createWorkspaceRepository({ userDataPath });

    await expect(repository.load()).rejects.toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "unreadable" }),
    );

    expect((await lstat(statePath)).isSymbolicLink()).toBe(true);
  });

  it("does not initialize over retained PDFs when state is missing", async () => {
    const userDataPath = await createUserDataPath();
    const retainedPdfPath = join(userDataPath, "retained-pdfs", "ORPHAN-0001.pdf");
    await mkdir(join(userDataPath, "retained-pdfs"));
    await writeFile(retainedPdfPath, "owner retained data");
    const repository = createWorkspaceRepository({ userDataPath });

    await expect(repository.load()).rejects.toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "inconsistent" }),
    );

    await expect(access(join(userDataPath, "state.json"))).rejects.toThrow("ENOENT");
    await expect(readFile(retainedPdfPath, "utf8")).resolves.toBe("owner retained data");
  });

  it.each([
    ["temporary-state-cleanup", true, false],
    ["startup-retained-pdf-cleanup", false, true],
  ] satisfies readonly [FaultPoint, boolean, boolean][])(
    "keeps validated state usable and completes independent cleanup when %s fails",
    async (faultPoint, temporaryStateRemains, unreferencedPdfRemains) => {
      const userDataPath = await createUserDataPath();
      const initialRepository = createWorkspaceRepository({ userDataPath });
      await initialRepository.load();
      const temporaryStatePath = join(userDataPath, "state.json.tmp");
      const unreferencedPdfPath = join(userDataPath, "retained-pdfs", "UNUSED-0001.pdf");
      await Promise.all([
        writeFile(temporaryStatePath, "stale candidate state"),
        writeFile(unreferencedPdfPath, "unreferenced PDF"),
      ]);
      const repository = createWorkspaceRepository({
        faultInjector: createFaultInjector([faultPoint]),
        userDataPath,
      });

      await expect(repository.load()).resolves.toEqual(initialWorkspaceState);
      await expect(pathExistsForTest(temporaryStatePath)).resolves.toBe(temporaryStateRemains);
      await expect(pathExistsForTest(unreferencedPdfPath)).resolves.toBe(unreferencedPdfRemains);

      await expect(initialRepository.load()).resolves.toEqual(initialWorkspaceState);
      await expect(pathExistsForTest(temporaryStatePath)).resolves.toBe(false);
      await expect(pathExistsForTest(unreferencedPdfPath)).resolves.toBe(false);
    },
  );

  it("retains exact PDF bytes before atomically committing an issued invoice", async () => {
    const userDataPath = await createUserDataPath();
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const bytes = new TextEncoder().encode("%PDF-1.7\nexact issued bytes\n%%EOF");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const invoice = persistedIssuedInvoiceSchema.parse({
      ...completeIssuedInvoice,
      retainedPdf: { filename: "GGIOHK-0043.pdf", sha256 },
    });
    const issuedWorkspace = {
      ...initialWorkspaceState,
      clients: [
        persistedClientSchema.parse({
          ...completeClient,
          invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
        }),
      ],
      draft: null,
      issuedInvoices: [invoice],
      issuer: completeIssuer,
    };

    await repository.commitRetainedDocument(
      issuedWorkspace,
      { kind: "issued-invoice", record: invoice },
      { bytes, pdf: invoice.retainedPdf },
    );

    await expect(readFile(join(userDataPath, "retained-pdfs", "GGIOHK-0043.pdf"))).resolves.toEqual(
      Buffer.from(bytes),
    );
    await expect(repository.load()).resolves.toEqual(issuedWorkspace);
  });

  it("retains exact credit-note bytes before atomically committing the linked record", async () => {
    const userDataPath = await createUserDataPath();
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const issued = createIssuedWorkspace();
    await repository.commitRetainedDocument(
      issued.issuedWorkspace,
      issued.document,
      issued.preparedPdf,
    );
    const bytes = new TextEncoder().encode("%PDF-1.7\nexact credit-note bytes\n%%EOF");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const creditNote = persistedCreditNoteSchema.parse({
      ...completeCreditNote,
      retainedPdf: { filename: "CN-GGIOHK-0043.pdf", sha256 },
    });
    const creditedWorkspace = {
      ...issued.issuedWorkspace,
      creditNotes: [creditNote],
    };

    await repository.commitRetainedDocument(
      creditedWorkspace,
      { kind: "credit-note", record: creditNote },
      { bytes, pdf: creditNote.retainedPdf },
    );

    await expect(
      readFile(join(userDataPath, "retained-pdfs", "CN-GGIOHK-0043.pdf")),
    ).resolves.toEqual(Buffer.from(bytes));
    await expect(repository.load()).resolves.toEqual(creditedWorkspace);
  });

  it("removes unreferenced prepared PDFs at startup but keeps retained invoices", async () => {
    const userDataPath = await createUserDataPath();
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const unreferencedPath = join(userDataPath, "retained-pdfs", "UNUSED-0001.pdf");
    await writeFile(unreferencedPath, "%PDF-1.7\nprepared only\n%%EOF");

    await repository.load();

    await expect(readFile(unreferencedPath)).rejects.toThrow("ENOENT");
  });

  it("cleans only stale state and PDF artifacts while keeping durable PDFs and other files", async () => {
    const userDataPath = await createUserDataPath();
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const { document, issuedWorkspace, preparedPdf } = createIssuedWorkspace();
    await repository.commitRetainedDocument(issuedWorkspace, document, preparedPdf);
    const retainedDirectory = join(userDataPath, "retained-pdfs");
    const retainedPath = join(retainedDirectory, preparedPdf.pdf.filename);
    const unreferencedPdfPath = join(retainedDirectory, "UNUSED-0001.pdf");
    const preparedPdfPath = join(retainedDirectory, "UNUSED-0002.pdf.tmp");
    const unrelatedPath = join(retainedDirectory, "recovery-notes.txt");
    const temporaryStatePath = join(userDataPath, "state.json.tmp");
    await Promise.all([
      writeFile(unreferencedPdfPath, "unreferenced PDF"),
      writeFile(preparedPdfPath, "prepared PDF"),
      writeFile(unrelatedPath, "leave this file alone"),
      writeFile(temporaryStatePath, "stale candidate state"),
    ]);

    await expect(repository.load()).resolves.toEqual(issuedWorkspace);

    await expect(readFile(retainedPath)).resolves.toEqual(Buffer.from(preparedPdf.bytes));
    await expect(readFile(unrelatedPath, "utf8")).resolves.toBe("leave this file alone");
    await expect(access(unreferencedPdfPath)).rejects.toThrow("ENOENT");
    await expect(access(preparedPdfPath)).rejects.toThrow("ENOENT");
    await expect(access(temporaryStatePath)).rejects.toThrow("ENOENT");
  });

  it("leaves cleanup artifacts untouched when the durable dataset fails validation", async () => {
    const userDataPath = await createUserDataPath();
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const { document, issuedWorkspace, preparedPdf } = createIssuedWorkspace();
    await repository.commitRetainedDocument(issuedWorkspace, document, preparedPdf);
    const retainedDirectory = join(userDataPath, "retained-pdfs");
    const retainedPath = join(retainedDirectory, preparedPdf.pdf.filename);
    const unreferencedPdfPath = join(retainedDirectory, "UNUSED-0001.pdf");
    const temporaryStatePath = join(userDataPath, "state.json.tmp");
    await Promise.all([
      writeFile(retainedPath, "corrupt retained PDF"),
      writeFile(unreferencedPdfPath, "unreferenced PDF"),
      writeFile(temporaryStatePath, "stale candidate state"),
    ]);

    await expect(repository.load()).rejects.toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "inconsistent" }),
    );

    await expect(readFile(unreferencedPdfPath, "utf8")).resolves.toBe("unreferenced PDF");
    await expect(readFile(temporaryStatePath, "utf8")).resolves.toBe("stale candidate state");
  });

  it("injects a draft save failure at the repository write boundary and allows retry", async () => {
    const userDataPath = await createUserDataPath();
    const initialRepository = createWorkspaceRepository({ userDataPath });
    await initialRepository.load();
    const draftWorkspace: WorkspaceState = {
      ...initialWorkspaceState,
      clients: [completeClient],
      draft: {
        kind: "ordinary",
        draft: persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput),
      },
      issuer: completeIssuer,
    };
    const repository = createWorkspaceRepository({
      faultInjector: createFaultInjector(["draft-save"]),
      userDataPath,
    });

    await expect(repository.save(draftWorkspace)).rejects.toThrow("Injected failure at draft-save");
    await expect(initialRepository.load()).resolves.toEqual(initialWorkspaceState);

    await repository.save(draftWorkspace);
    await expect(repository.load()).resolves.toEqual(draftWorkspace);
  });

  it.each([
    "retained-pdf-write",
    "temporary-state-write",
    "candidate-state-validation",
    "durable-state-rename",
  ] satisfies readonly FaultPoint[])(
    "keeps the draft, number, and empty history when %s fails",
    async (faultPoint) => {
      const userDataPath = await createUserDataPath();
      const initialRepository = createWorkspaceRepository({ userDataPath });
      const draftWorkspace: WorkspaceState = {
        ...initialWorkspaceState,
        clients: [completeClient],
        draft: {
          kind: "ordinary",
          draft: persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput),
        },
        issuer: completeIssuer,
      };
      await initialRepository.save(draftWorkspace);
      const { document, issuedWorkspace, preparedPdf } = createIssuedWorkspace();
      const repository = createWorkspaceRepository({
        faultInjector: createFaultInjector([faultPoint]),
        userDataPath,
      });

      await expect(
        repository.commitRetainedDocument(issuedWorkspace, document, preparedPdf),
      ).rejects.toThrow(`Injected failure at ${faultPoint}`);

      await expect(initialRepository.load()).resolves.toEqual(draftWorkspace);
      await expect(
        access(join(userDataPath, "retained-pdfs", preparedPdf.pdf.filename)),
      ).rejects.toThrow("ENOENT");
    },
  );

  it("classifies a state path that cannot be read as a file without replacing it", async () => {
    const userDataPath = await createUserDataPath();
    const statePath = join(userDataPath, "state.json");
    const markerPath = join(userDataPath, "owner-file.txt");
    await Promise.all([mkdir(statePath), writeFile(markerPath, "leave owner data unchanged")]);

    await expect(createWorkspaceRepository({ userDataPath }).load()).rejects.toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "unreadable" }),
    );

    await expect(stat(statePath).then((stateStats) => stateStats.isDirectory())).resolves.toBe(
      true,
    );
    await expect(readFile(markerPath, "utf8")).resolves.toBe("leave owner data unchanged");
  });

  it("replaces an uncommitted prepared PDF when a same-session issue retry produces new bytes", async () => {
    const userDataPath = await createUserDataPath();
    await createWorkspaceRepository({ userDataPath }).load();
    const faultInjector = createFaultInjector(["durable-state-rename"]);
    const repository = createWorkspaceRepository({ faultInjector, userDataPath });
    const firstAttempt = createIssuedWorkspace("first PDF attempt");

    await expect(
      repository.commitRetainedDocument(
        firstAttempt.issuedWorkspace,
        firstAttempt.document,
        firstAttempt.preparedPdf,
      ),
    ).rejects.toThrow("Injected failure at durable-state-rename");

    const retry = createIssuedWorkspace("retry PDF bytes");
    await repository.commitRetainedDocument(
      retry.issuedWorkspace,
      retry.document,
      retry.preparedPdf,
    );

    await expect(repository.load()).resolves.toEqual(retry.issuedWorkspace);
    await expect(
      readFile(join(userDataPath, "retained-pdfs", retry.preparedPdf.pdf.filename)),
    ).resolves.toEqual(Buffer.from(retry.preparedPdf.bytes));
  });

  it("never replaces a retained PDF after durable state references it", async () => {
    const userDataPath = await createUserDataPath();
    const repository = createWorkspaceRepository({ userDataPath });
    await repository.load();
    const committedIssue = createIssuedWorkspace("durable PDF bytes");
    await repository.commitRetainedDocument(
      committedIssue.issuedWorkspace,
      committedIssue.document,
      committedIssue.preparedPdf,
    );

    const replacementAttempt = createIssuedWorkspace("replacement PDF bytes");
    await expect(
      repository.commitRetainedDocument(
        replacementAttempt.issuedWorkspace,
        replacementAttempt.document,
        replacementAttempt.preparedPdf,
      ),
    ).rejects.toThrow("The retained document PDF cannot be replaced");

    await expect(repository.load()).resolves.toEqual(committedIssue.issuedWorkspace);
    await expect(
      readFile(join(userDataPath, "retained-pdfs", committedIssue.preparedPdf.pdf.filename)),
    ).resolves.toEqual(Buffer.from(committedIssue.preparedPdf.bytes));
  });
});

function createIssuedWorkspace(pdfBody = "exact issued bytes") {
  const bytes = new TextEncoder().encode(`%PDF-1.7\n${pdfBody}\n%%EOF`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const invoice = persistedIssuedInvoiceSchema.parse({
    ...completeIssuedInvoice,
    retainedPdf: { filename: "GGIOHK-0043.pdf", sha256 },
  });
  return {
    document: { kind: "issued-invoice", record: invoice } as const,
    issuedWorkspace: {
      ...initialWorkspaceState,
      clients: [
        persistedClientSchema.parse({
          ...completeClient,
          invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
        }),
      ],
      draft: null,
      issuedInvoices: [invoice],
      issuer: completeIssuer,
    },
    preparedPdf: { bytes, pdf: invoice.retainedPdf },
  };
}

async function createUserDataPath(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "invoice-generator-repository-"));
  temporaryPaths.push(path);
  return path;
}

async function pathExistsForTest(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
