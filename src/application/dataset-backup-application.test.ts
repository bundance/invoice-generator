import { describe, expect, it } from "vite-plus/test";

import { completeClient } from "../../tests/fixtures/client.js";
import { completeInvoiceDraftInput } from "../../tests/fixtures/issued-invoice.js";
import { completeIssuer } from "../../tests/fixtures/issuer-settings.js";
import { persistedInvoiceDraftSchema } from "../domain/invoices/invoice-draft.js";
import { parseBusinessDate } from "../domain/time/business-date.js";
import { restoreIdSchema } from "./dataset-restore.js";
import { openInvoiceApplication } from "./invoice-application.js";
import { WorkspaceRecoveryError, type WorkspaceRecoveryProblem } from "./workspace-recovery.js";
import {
  initialWorkspaceState,
  type DatasetArchive,
  type WorkspaceRepository,
  type WorkspaceState,
} from "./workspace.js";

const backupSummary = {
  archiveSchemaVersion: 1,
  clientCount: 1,
  creditNoteCount: 0,
  issuedInvoiceCount: 0,
  pdfFilenames: [],
  workspaceSchemaVersion: 6,
} as const;
const restoreId = restoreIdSchema.parse("7a56ed1d-f110-4f1f-8b80-6064af3f1636");

describe("dataset backup application", () => {
  it.each([
    "inconsistent",
    "invalid-schema",
    "malformed",
    "newer-version",
    "unreadable",
  ] satisfies readonly WorkspaceRecoveryProblem[])(
    "blocks normal use when startup state is %s",
    async (problem) => {
      const application = await openTestApplication(cancelledDatasetArchive(), {
        ...memoryWorkspaceRepository(),
        load: () => Promise.reject(new WorkspaceRecoveryError(problem)),
      });

      await expect(application.loadWorkspace()).resolves.toEqual({
        kind: "recovery-required",
        problem,
      });
      await expect(application.saveIssuerSettings(completeIssuer)).resolves.toMatchObject({
        kind: "failed",
      });
      await expect(application.createBackup()).resolves.toMatchObject({ kind: "failed" });
    },
  );

  it("stays blocked after cancelled, invalid, or failed recovery and opens after success", async () => {
    let inspection: "cancelled" | "invalid" | "ready" = "cancelled";
    let commitShouldFail = true;
    const restoredWorkspace = { ...initialWorkspaceState, clients: [completeClient] };
    const datasetArchive: DatasetArchive = {
      cancelRestore: () => undefined,
      commitRestore: () =>
        commitShouldFail
          ? Promise.reject(new Error("commit failed"))
          : Promise.resolve({
              cleanup: "complete",
              kind: "restored",
              state: restoredWorkspace,
            }),
      createBackup: () => Promise.resolve({ kind: "cancelled" }),
      inspectRestore: () => {
        if (inspection === "invalid") return Promise.reject(new Error("invalid backup"));
        return Promise.resolve(
          inspection === "cancelled"
            ? { kind: "cancelled" }
            : { kind: "ready", restoreId, summary: backupSummary },
        );
      },
    };
    const application = await openTestApplication(datasetArchive, {
      ...memoryWorkspaceRepository(),
      load: () => Promise.reject(new WorkspaceRecoveryError("malformed")),
    });

    await expect(application.inspectRestoreBackup()).resolves.toEqual({ kind: "cancelled" });
    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "recovery-required",
    });

    inspection = "invalid";
    await expect(application.inspectRestoreBackup()).resolves.toMatchObject({ kind: "invalid" });
    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "recovery-required",
    });

    inspection = "ready";
    await expect(application.inspectRestoreBackup()).resolves.toMatchObject({ kind: "ready" });
    await expect(application.restoreBackup(restoreId)).resolves.toMatchObject({ kind: "failed" });
    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "recovery-required",
    });

    commitShouldFail = false;
    await expect(application.inspectRestoreBackup()).resolves.toMatchObject({ kind: "ready" });
    await expect(application.restoreBackup(restoreId)).resolves.toEqual({
      cleanup: "complete",
      kind: "restored",
    });
    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: { clients: [completeClient] },
    });
  });

  it("loads the inspected replacement and can issue its restored draft", async () => {
    const restoredWorkspace: WorkspaceState = {
      ...initialWorkspaceState,
      clients: [completeClient],
      draft: {
        kind: "ordinary",
        draft: persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput),
      },
      issuer: completeIssuer,
    };
    const datasetArchive: DatasetArchive = {
      cancelRestore: () => undefined,
      commitRestore: (committedRestoreId) => {
        expect(committedRestoreId).toBe(restoreId);
        return Promise.resolve({ cleanup: "complete", kind: "restored", state: restoredWorkspace });
      },
      createBackup: () => Promise.resolve({ kind: "created", summary: backupSummary }),
      inspectRestore: () => Promise.resolve({ kind: "ready", restoreId, summary: backupSummary }),
    };
    const workspaceRepository = memoryWorkspaceRepository();
    const application = await openInvoiceApplication({
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      creditNotePdf: {
        ...unusedPdfPreviewMethods,
        checkFit: () => Promise.resolve(true),
        prepare: () => Promise.reject(new Error("Credit-note issue is not used in this test")),
      },
      currentBusinessDate: () => parseBusinessDate("2026-09-04"),
      currentTimestamp: () => "2026-09-04T10:11:12.000Z",
      datasetArchive,
      invoicePdf: {
        ...unusedPdfPreviewMethods,
        checkFit: () => Promise.resolve(true),
        prepare: (snapshot) =>
          Promise.resolve({
            bytes: new Uint8Array([37, 80, 68, 70]),
            pdf: { filename: `${snapshot.id}.pdf`, sha256: "c".repeat(64) },
          }),
      },
      workspaceRepository,
    });

    await expect(application.inspectRestoreBackup()).resolves.toEqual({
      kind: "ready",
      restoreId,
      summary: backupSummary,
    });
    await expect(application.restoreBackup(restoreId)).resolves.toEqual({
      cleanup: "complete",
      kind: "restored",
    });
    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        clients: [completeClient],
        draft: { kind: "ordinary", draft: completeInvoiceDraftInput },
      },
    });
    await expect(
      application.issueInvoice({
        draft: completeInvoiceDraftInput,
        expectedInvoiceId: "GGIOHK-0043",
        lateIssueDateAcknowledged: false,
      }),
    ).resolves.toMatchObject({ kind: "issued", invoice: { id: "GGIOHK-0043" } });
  });

  it("reports cancelled selection and pre-commit failures without changing current state", async () => {
    let failOperations = false;
    const datasetArchive: DatasetArchive = {
      cancelRestore: () => undefined,
      commitRestore: () =>
        failOperations
          ? Promise.reject(new Error("commit failed"))
          : Promise.resolve({
              cleanup: "complete",
              kind: "restored",
              state: initialWorkspaceState,
            }),
      createBackup: () =>
        failOperations
          ? Promise.reject(new Error("backup failed"))
          : Promise.resolve({ kind: "cancelled" }),
      inspectRestore: () =>
        failOperations
          ? Promise.reject(new Error("invalid archive"))
          : Promise.resolve({ kind: "cancelled" }),
    };
    const application = await openTestApplication(datasetArchive);

    await expect(application.createBackup()).resolves.toEqual({ kind: "cancelled" });
    await expect(application.inspectRestoreBackup()).resolves.toEqual({ kind: "cancelled" });
    failOperations = true;
    await expect(application.createBackup()).resolves.toEqual({
      kind: "failed",
      message: "Could not create the backup. Your current dataset is unchanged.",
    });
    await expect(application.inspectRestoreBackup()).resolves.toEqual({
      kind: "invalid",
      message: "The selected backup is invalid or incomplete. Your current dataset is unchanged.",
    });
    await expect(application.restoreBackup(restoreId)).resolves.toEqual({
      kind: "failed",
      message: "Restore did not replace your current dataset. You can keep using it and try again.",
    });
    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: { clients: [], draft: null, issuedInvoices: [], issuer: null },
    });
  });

  it("adopts the restored dataset when post-commit PDF cleanup needs a restart", async () => {
    const restoredWorkspace = { ...initialWorkspaceState, clients: [completeClient] };
    const datasetArchive: DatasetArchive = {
      cancelRestore: () => undefined,
      commitRestore: () =>
        Promise.resolve({
          cleanup: "restart-required",
          kind: "restored",
          state: restoredWorkspace,
        }),
      createBackup: () => Promise.resolve({ kind: "cancelled" }),
      inspectRestore: () => Promise.resolve({ kind: "ready", restoreId, summary: backupSummary }),
    };
    const application = await openTestApplication(datasetArchive);

    await expect(application.restoreBackup(restoreId)).resolves.toEqual({
      cleanup: "restart-required",
      kind: "restored",
    });
    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: { clients: [completeClient] },
    });
  });

  it("passes cancellation to the archive with the inspected restore ID", async () => {
    let cancelledRestoreId = "";
    const datasetArchive: DatasetArchive = {
      cancelRestore: (id) => {
        cancelledRestoreId = id;
      },
      commitRestore: () => Promise.reject(new Error("Restore is not used in this test")),
      createBackup: () => Promise.resolve({ kind: "cancelled" }),
      inspectRestore: () => Promise.resolve({ kind: "ready", restoreId, summary: backupSummary }),
    };
    const application = await openTestApplication(datasetArchive);

    await application.cancelRestoreBackup(restoreId);

    expect(cancelledRestoreId).toBe(restoreId);
  });
});

function openTestApplication(
  datasetArchive: DatasetArchive,
  workspaceRepository = memoryWorkspaceRepository(),
) {
  return openInvoiceApplication({
    appVersion: "0.1.0",
    createClientId: () => completeClient.id,
    creditNotePdf: {
      ...unusedPdfPreviewMethods,
      checkFit: () => Promise.resolve(true),
      prepare: () => Promise.reject(new Error("Credit-note issue is not used in this test")),
    },
    currentBusinessDate: () => parseBusinessDate("2026-09-04"),
    currentTimestamp: () => "2026-09-04T10:11:12.000Z",
    datasetArchive,
    invoicePdf: {
      ...unusedPdfPreviewMethods,
      checkFit: () => Promise.resolve(true),
      prepare: () => Promise.reject(new Error("Invoice issue is not used in this test")),
    },
    workspaceRepository,
  });
}

function cancelledDatasetArchive(): DatasetArchive {
  return {
    cancelRestore: () => undefined,
    commitRestore: () => Promise.reject(new Error("Restore is not used in this test")),
    createBackup: () => Promise.resolve({ kind: "cancelled" }),
    inspectRestore: () => Promise.resolve({ kind: "cancelled" }),
  };
}

function memoryWorkspaceRepository(): WorkspaceRepository {
  let workspace: WorkspaceState = initialWorkspaceState;
  return {
    commitRetainedDocument: (state) => {
      workspace = state;
      return Promise.resolve();
    },
    load: () => Promise.resolve(workspace),
    retainedPdfPath: () => Promise.reject(new Error("PDF access is not used in this test")),
    save: (state) => {
      workspace = state;
      return Promise.resolve();
    },
  };
}
const unusedPdfPreviewMethods = {
  preview: () => Promise.reject(new Error("Credit-note preview is not used in this test")),
  previewDraft: () => Promise.reject(new Error("Invoice preview is not used in this test")),
} as const;
