import { useRef } from "react";

import { ModalDialog } from "../../ui/modal-dialog.tsx";

type DraftRecoveryDialogProps = Readonly<{
  onDiscard: () => void;
  onResume: () => void;
}>;

export function DraftRecoveryDialog({ onDiscard, onResume }: DraftRecoveryDialogProps) {
  const resumeButton = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog initialFocus={resumeButton} labelledBy="draft-recovery-title" onCancel={onResume}>
      <p className="eyebrow">Recovered on this Mac</p>
      <h2 id="draft-recovery-title">Resume your invoice draft?</h2>
      <p>Your saved draft has no invoice number. Resume it or discard it without using one.</p>
      <div className="draft-actions">
        <button className="secondary-action" onClick={onDiscard} type="button">
          Discard recovered draft
        </button>
        <button className="primary-action" onClick={onResume} ref={resumeButton} type="button">
          Resume draft
        </button>
      </div>
    </ModalDialog>
  );
}
