import { ArchiveRestore } from "lucide-react";

import { RestoreBackupDialog } from "./restore-backup-dialog.tsx";
import { useDatasetBackup } from "./use-dataset-backup.ts";

export function DatasetBackupCard() {
  const backup = useDatasetBackup();

  return (
    <>
      <section className="settings-card dataset-backup-card">
        <ArchiveRestore aria-hidden="true" />
        <div>
          <p className="eyebrow">Local data</p>
          <h2>Backup and restore</h2>
          <p>
            Backup files contain financial and personal data. They are not encrypted by Invoice
            Generator.
          </p>
          <div className="dataset-backup-actions">
            <button
              className="secondary-action"
              disabled={backup.isBusy}
              onClick={backup.createBackup}
              type="button"
            >
              {backup.status === "creating" ? "Creating backup…" : "Create backup"}
            </button>
            <button
              className="secondary-action"
              disabled={backup.isBusy}
              onClick={backup.inspectRestore}
              type="button"
            >
              {backup.status === "inspecting" ? "Inspecting backup…" : "Restore backup"}
            </button>
          </div>
          {backup.message ? (
            <p aria-live="polite" className="dataset-backup-status">
              {backup.message}
            </p>
          ) : null}
        </div>
      </section>
      {backup.readyRestore ? (
        <RestoreBackupDialog
          isRestoring={backup.status === "restoring"}
          onCancel={backup.cancelRestore}
          onRestore={backup.restoreBackup}
          summary={backup.readyRestore.summary}
        />
      ) : null}
    </>
  );
}
