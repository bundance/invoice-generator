import { useState } from "react";

import type { RestoreInspectionResult } from "../../../application/invoice-application-contract.ts";

type ReadyRestore = Extract<RestoreInspectionResult, { kind: "ready" }>;
type DatasetBackupState =
  | Readonly<{ kind: "idle"; message: string }>
  | Readonly<{ kind: "creating" }>
  | Readonly<{ kind: "cancelling" }>
  | Readonly<{ kind: "inspecting" }>
  | Readonly<{ kind: "ready"; restore: ReadyRestore }>
  | Readonly<{ kind: "restoring"; restore: ReadyRestore }>;

export function useDatasetBackup() {
  const [backupState, setBackupState] = useState<DatasetBackupState>({
    kind: "idle",
    message: "",
  });

  async function createBackup(): Promise<void> {
    setBackupState({ kind: "creating" });
    try {
      const result = await window.invoiceApp.createBackup();
      setBackupState({
        kind: "idle",
        message:
          result.kind === "created"
            ? "Complete backup created and validated."
            : result.kind === "failed"
              ? result.message
              : "",
      });
    } catch {
      setBackupState({
        kind: "idle",
        message: "Could not create the backup. Your current dataset is unchanged.",
      });
    }
  }

  async function inspectRestore(): Promise<void> {
    setBackupState({ kind: "inspecting" });
    try {
      const result = await window.invoiceApp.inspectRestoreBackup();
      setBackupState(
        result.kind === "ready"
          ? { kind: "ready", restore: result }
          : { kind: "idle", message: result.kind === "cancelled" ? "" : result.message },
      );
    } catch {
      setBackupState({
        kind: "idle",
        message: "Could not inspect the selected backup. Your current dataset is unchanged.",
      });
    }
  }

  async function restoreBackup(): Promise<void> {
    if (backupState.kind !== "ready") return;
    setBackupState({ kind: "restoring", restore: backupState.restore });
    try {
      const result = await window.invoiceApp.restoreBackup(backupState.restore.restoreId);
      setBackupState({
        kind: "idle",
        message:
          result.kind === "restored"
            ? result.cleanup === "complete"
              ? "Dataset restored. Reloading the application…"
              : "Dataset restored. Restarting the application to finish old PDF cleanup…"
            : result.message,
      });
    } catch {
      setBackupState({
        kind: "idle",
        message: "Restore failed. Your current dataset is unchanged and still usable.",
      });
    }
  }

  async function cancelRestore(): Promise<void> {
    if (backupState.kind !== "ready") return;
    const restoreId = backupState.restore.restoreId;
    setBackupState({ kind: "cancelling" });
    try {
      await window.invoiceApp.cancelRestoreBackup(restoreId);
      setBackupState({ kind: "idle", message: "" });
    } catch {
      setBackupState({
        kind: "idle",
        message: "Could not cancel the prepared restore. Choose a backup again before restoring.",
      });
    }
  }

  const isBusy =
    backupState.kind === "cancelling" ||
    backupState.kind === "creating" ||
    backupState.kind === "inspecting" ||
    backupState.kind === "restoring";
  const message = backupState.kind === "idle" ? backupState.message : "";
  const readyRestore =
    backupState.kind === "ready" || backupState.kind === "restoring" ? backupState.restore : null;

  return {
    cancelRestore: () => void cancelRestore(),
    createBackup: () => void createBackup(),
    inspectRestore: () => void inspectRestore(),
    isBusy,
    message,
    readyRestore,
    restoreBackup: () => void restoreBackup(),
    status: backupState.kind,
  };
}
