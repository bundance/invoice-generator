import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { restoreIdSchema } from "../../../application/dataset-restore.js";
import App from "../../app/app.js";
import { unusedInvoiceAppCommands } from "../../app/app-test-support.js";

const restoreId = restoreIdSchema.parse("7a56ed1d-f110-4f1f-8b80-6064af3f1636");
const backupSummary = {
  archiveSchemaVersion: 1,
  clientCount: 0,
  creditNoteCount: 0,
  issuedInvoiceCount: 0,
  pdfFilenames: [],
  workspaceSchemaVersion: 6,
} as const;

describe("workspace recovery", () => {
  afterEach(cleanup);

  it.each([
    ["inconsistent", "Inconsistent financial records"],
    ["invalid-schema", "Invalid state schema"],
    ["malformed", "Malformed state"],
    ["newer-version", "Newer unsupported state"],
    ["unreadable", "Unreadable state"],
  ] as const)("labels %s state clearly", async (problem, label) => {
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () => Promise.resolve({ kind: "recovery-required", problem }),
    };
    render(<App />);

    expect(await screen.findByText(label)).toBeVisible();
  });

  it("shows the problem category and only recovery or quit actions", async () => {
    let quitCount = 0;
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () => Promise.resolve({ kind: "recovery-required", problem: "malformed" }),
      quitApplication: () => {
        quitCount += 1;
        return Promise.resolve();
      },
    };
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Recovery required" })).toBeVisible();
    expect(screen.getByText("Malformed state")).toBeVisible();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getAllByRole("button").map(({ textContent }) => textContent)).toEqual([
      "Select validated backup",
      "Quit",
    ]);

    await user.click(screen.getByRole("button", { name: "Quit" }));
    expect(quitCount).toBe(1);
  });

  it.each([
    ["cancelled", "No backup was selected. Recovery is still required."],
    ["invalid", "The selected backup is invalid or incomplete. Your current dataset is unchanged."],
    ["failed", "Restore did not replace the blocked dataset. Recovery is still required."],
  ] as const)("stays blocked when recovery is %s", async (outcome, message) => {
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      inspectRestoreBackup: () =>
        Promise.resolve(
          outcome === "cancelled"
            ? { kind: "cancelled" }
            : outcome === "invalid"
              ? { kind: "invalid", message }
              : { kind: "ready", restoreId, summary: backupSummary },
        ),
      loadWorkspace: () =>
        Promise.resolve({ kind: "recovery-required", problem: "invalid-schema" }),
      quitApplication: () => Promise.resolve(),
      restoreBackup: () => Promise.resolve({ kind: "failed", message }),
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Select validated backup" }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recovery required" })).toBeVisible();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("commits a validated replacement through the restore contract", async () => {
    const committedRestoreIds: string[] = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      inspectRestoreBackup: () =>
        Promise.resolve({ kind: "ready", restoreId, summary: backupSummary }),
      loadWorkspace: () => Promise.resolve({ kind: "recovery-required", problem: "newer-version" }),
      quitApplication: () => Promise.resolve(),
      restoreBackup: (selectedRestoreId) => {
        committedRestoreIds.push(selectedRestoreId);
        return Promise.resolve({ cleanup: "complete", kind: "restored" });
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Select validated backup" }));

    await waitFor(() => expect(committedRestoreIds).toEqual([restoreId]));
    expect(screen.getByText("Dataset replaced. Reloading Invoice Generator…")).toBeVisible();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
