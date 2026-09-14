import { HardDriveDownload } from "lucide-react";
import { useState } from "react";

import type { WorkspaceRecoveryProblem } from "../../../application/workspace-recovery.js";

type RecoveryScreenProps = Readonly<{
  problem: WorkspaceRecoveryProblem;
}>;

type RecoveryState =
  | Readonly<{ kind: "idle"; message: string }>
  | Readonly<{ kind: "selecting" }>
  | Readonly<{ kind: "restoring" }>
  | Readonly<{ kind: "reloading" }>;

const recoveryProblemCopy = {
  malformed: {
    title: "Malformed state",
    message: "The saved state is not valid JSON and cannot be trusted.",
  },
  "invalid-schema": {
    title: "Invalid state schema",
    message: "The saved state does not match any schema supported by this release.",
  },
  inconsistent: {
    title: "Inconsistent financial records",
    message: "The saved state or its retained documents disagree with each other.",
  },
  "newer-version": {
    title: "Newer unsupported state",
    message: "The saved state belongs to a newer release and cannot be opened safely.",
  },
  unreadable: {
    title: "Unreadable state",
    message: "The saved state or its retained documents could not be read safely.",
  },
} satisfies Record<WorkspaceRecoveryProblem, Readonly<{ message: string; title: string }>>;

export function RecoveryScreen({ problem }: RecoveryScreenProps) {
  const [state, setState] = useState<RecoveryState>({ kind: "idle", message: "" });
  const actionsDisabled = state.kind !== "idle";
  const problemCopy = recoveryProblemCopy[problem];

  async function selectBackup(): Promise<void> {
    setState({ kind: "selecting" });
    try {
      const inspection = await window.invoiceApp.inspectRestoreBackup();
      if (inspection.kind === "cancelled") {
        setState({ kind: "idle", message: "No backup was selected. Recovery is still required." });
        return;
      }
      if (inspection.kind === "invalid") {
        setState({ kind: "idle", message: inspection.message });
        return;
      }

      setState({ kind: "restoring" });
      const restore = await window.invoiceApp.restoreBackup(inspection.restoreId);
      setState(
        restore.kind === "restored"
          ? { kind: "reloading" }
          : { kind: "idle", message: restore.message },
      );
    } catch {
      setState({
        kind: "idle",
        message: "Recovery could not finish. The blocked dataset is unchanged.",
      });
    }
  }

  async function quit(): Promise<void> {
    try {
      await window.invoiceApp.quitApplication();
    } catch {
      setState({ kind: "idle", message: "Invoice Generator could not quit." });
    }
  }

  return (
    <main className="launch-state launch-state--error recovery-screen">
      <HardDriveDownload aria-hidden="true" />
      <p className="recovery-screen__eyebrow">{problemCopy.title}</p>
      <h1>Recovery required</h1>
      <p>{problemCopy.message}</p>
      <p>
        {state.kind === "reloading"
          ? "The validated backup has replaced the complete dataset."
          : "Your existing files have not been changed. Select a complete validated backup or quit."}
      </p>
      <div className="recovery-screen__actions">
        <button
          className="primary-action"
          disabled={actionsDisabled}
          onClick={() => void selectBackup()}
          type="button"
        >
          Select validated backup
        </button>
        <button
          className="secondary-action"
          disabled={actionsDisabled}
          onClick={() => void quit()}
          type="button"
        >
          Quit
        </button>
      </div>
      <p aria-live="polite" className="recovery-screen__status">
        {recoveryStatus(state)}
      </p>
    </main>
  );
}

function recoveryStatus(state: RecoveryState): string {
  switch (state.kind) {
    case "idle":
      return state.message;
    case "selecting":
      return "Validating the selected backup…";
    case "restoring":
      return "Replacing the complete dataset…";
    case "reloading":
      return "Dataset replaced. Reloading Invoice Generator…";
  }
}
