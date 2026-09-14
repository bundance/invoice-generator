import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { restoreIdSchema } from "../../../application/dataset-restore.ts";
import { unusedInvoiceAppCommands } from "../../app/app-test-support.ts";
import { DatasetBackupCard } from "./dataset-backup-card.tsx";

const summary = {
  archiveSchemaVersion: 1,
  clientCount: 2,
  creditNoteCount: 1,
  issuedInvoiceCount: 3,
  pdfFilenames: ["ACME-0001.pdf", "CN-ACME-0001.pdf", "GGIOHK-0043.pdf"],
  workspaceSchemaVersion: 6,
} as const;
const restoreId = restoreIdSchema.parse("d3d3a670-febf-4905-804c-5c7945a97f13");

describe("dataset backup card", () => {
  afterEach(cleanup);

  it("warns about unencrypted data and confirms a summarized replacement without merging", async () => {
    let cancelledRestoreId = "";
    let restoreCount = 0;
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      cancelRestoreBackup: (id) => {
        cancelledRestoreId = id;
        return Promise.resolve();
      },
      createBackup: () => Promise.resolve({ kind: "created", summary }),
      inspectRestoreBackup: () => Promise.resolve({ kind: "ready", restoreId, summary }),
      loadWorkspace: () => Promise.reject(new Error("Workspace loading is not used in this test")),
      restoreBackup: (committedRestoreId) => {
        expect(committedRestoreId).toBe(restoreId);
        restoreCount += 1;
        return Promise.resolve({ cleanup: "complete", kind: "restored" });
      },
      saveIssuerSettings: () =>
        Promise.reject(new Error("Issuer settings are not used in this test")),
    };
    const user = userEvent.setup();
    render(<DatasetBackupCard />);

    expect(
      screen.getByText(/financial and personal data.*not encrypted by Invoice Generator/i),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create backup" }));
    expect(await screen.findByText("Complete backup created and validated.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    expect(
      await screen.findByRole("heading", { name: "Replace the complete dataset?" }),
    ).toBeVisible();
    expect(screen.getByText("Archive schema 1")).toBeVisible();
    expect(screen.getByText("Workspace schema 6")).toBeVisible();
    expect(screen.getByText("2 clients")).toBeVisible();
    expect(screen.getByText("3 invoices")).toBeVisible();
    expect(screen.getByText("1 credit note")).toBeVisible();
    expect(screen.getByText("GGIOHK-0043.pdf")).toBeVisible();
    expect(
      screen.getByText(/replaces the complete current dataset.*never merges records/i),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cancel restore" }));
    expect(cancelledRestoreId).toBe(restoreId);
    expect(restoreCount).toBe(0);
    expect(screen.queryByRole("heading", { name: "Replace the complete dataset?" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    await user.click(await screen.findByRole("button", { name: "Replace complete dataset" }));
    expect(restoreCount).toBe(1);
    expect(await screen.findByText("Dataset restored. Reloading the application…")).toBeVisible();
  });
});
