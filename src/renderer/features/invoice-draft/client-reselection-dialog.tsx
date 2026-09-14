import { useRef } from "react";

import type { Client } from "../../../domain/clients/client.ts";
import { ModalDialog } from "../../ui/modal-dialog.tsx";

type ClientReselectionDialogProps = Readonly<{
  client: Client;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function ClientReselectionDialog({
  client,
  onCancel,
  onConfirm,
}: ClientReselectionDialogProps) {
  const keepEditingButton = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      initialFocus={keepEditingButton}
      labelledBy="client-reselection-title"
      onCancel={onCancel}
    >
      <p className="eyebrow">Replace draft details</p>
      <h2 id="client-reselection-title">Change this draft to {client.legalName}?</h2>
      <p>
        This replaces the client facts and every draft field that began as a client default. Your
        current draft edits will be lost.
      </p>
      <div className="draft-actions">
        <button
          className="secondary-action"
          onClick={onCancel}
          ref={keepEditingButton}
          type="button"
        >
          Keep editing
        </button>
        <button className="primary-action" onClick={onConfirm} type="button">
          Replace draft details
        </button>
      </div>
    </ModalDialog>
  );
}
