import { useEffect, useRef, type ReactNode, type RefObject } from "react";

type ModalDialogProps = Readonly<{
  children: ReactNode;
  initialFocus: RefObject<HTMLElement | null>;
  labelledBy: string;
  onCancel: () => void;
}>;

export function ModalDialog({ children, initialFocus, labelledBy, onCancel }: ModalDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const currentDialog = dialog.current;
    currentDialog?.showModal();
    initialFocus.current?.focus();
    return () => {
      if (currentDialog?.open) currentDialog.close();
    };
  }, [initialFocus]);

  return (
    <div className="dialog-backdrop">
      <dialog
        aria-labelledby={labelledBy}
        aria-modal="true"
        className="draft-dialog"
        onCancel={(event) => {
          event.preventDefault();
          onCancel();
        }}
        ref={dialog}
      >
        {children}
      </dialog>
    </div>
  );
}
