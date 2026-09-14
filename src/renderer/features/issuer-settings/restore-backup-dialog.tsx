import { useRef } from "react";

import type { DatasetArchiveSummary } from "../../../application/workspace.ts";
import { ModalDialog } from "../../ui/modal-dialog.tsx";

type RestoreBackupDialogProps = Readonly<{
  isRestoring: boolean;
  onCancel: () => void;
  onRestore: () => void;
  summary: DatasetArchiveSummary;
}>;

export function RestoreBackupDialog({
  isRestoring,
  onCancel,
  onRestore,
  summary,
}: RestoreBackupDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      initialFocus={cancelButton}
      labelledBy="restore-backup-heading"
      onCancel={() => {
        if (!isRestoring) onCancel();
      }}
    >
      <p className="eyebrow">Validated backup</p>
      <h2 id="restore-backup-heading">Replace the complete dataset?</h2>
      <dl className="restore-summary">
        <SummaryFact
          label="Archive format"
          value={`Archive schema ${summary.archiveSchemaVersion}`}
        />
        <SummaryFact
          label="Saved data"
          value={`Workspace schema ${summary.workspaceSchemaVersion}`}
        />
        <SummaryFact label="Clients" value={countLabel(summary.clientCount, "client")} />
        <SummaryFact label="Invoices" value={countLabel(summary.issuedInvoiceCount, "invoice")} />
        <SummaryFact
          label="Credit notes"
          value={countLabel(summary.creditNoteCount, "credit note")}
        />
      </dl>
      <section aria-labelledby="restore-pdf-heading" className="restore-pdf-list">
        <h3 id="restore-pdf-heading">Retained PDFs</h3>
        {summary.pdfFilenames.length === 0 ? (
          <p>No retained PDFs</p>
        ) : (
          <ul>
            {summary.pdfFilenames.map((filename) => (
              <li key={filename}>{filename}</li>
            ))}
          </ul>
        )}
      </section>
      <p className="issue-effect">
        Restore replaces the complete current dataset and never merges records. Every current
        client, draft, document, and retained PDF that is absent from this backup will be removed.
      </p>
      <div className="draft-actions">
        <button
          className="secondary-action"
          disabled={isRestoring}
          onClick={onCancel}
          ref={cancelButton}
          type="button"
        >
          Cancel restore
        </button>
        <button className="primary-action" disabled={isRestoring} onClick={onRestore} type="button">
          {isRestoring ? "Replacing dataset…" : "Replace complete dataset"}
        </button>
      </div>
    </ModalDialog>
  );
}

type SummaryFactProps = Readonly<{ label: string; value: string }>;

function SummaryFact({ label, value }: SummaryFactProps) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
