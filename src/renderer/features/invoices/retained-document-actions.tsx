import { useState } from "react";

import type { RetainedDocumentActionResult } from "../../../application/invoice-application-contract.ts";
import type { DocumentId } from "../../../domain/invoices/retained-document.ts";

type RetainedDocumentActionsProps = Readonly<{ documentId: DocumentId }>;

export function RetainedDocumentActions({ documentId }: RetainedDocumentActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  async function runDocumentAction(
    action: () => Promise<RetainedDocumentActionResult>,
    successMessage: string,
  ): Promise<void> {
    setFeedback(null);
    try {
      const result = await action();
      if (result.kind === "completed") setFeedback(successMessage);
      if (result.kind === "failed") setFeedback(result.message);
    } catch {
      setFeedback("Could not use the retained PDF.");
    }
  }

  return (
    <div className="retained-document-actions">
      <div className="invoice-history-actions">
        <button
          aria-label={`Open ${documentId}`}
          className="secondary-action"
          onClick={() =>
            void runDocumentAction(
              () => window.invoiceApp.openRetainedDocument(documentId),
              "Opened the retained PDF.",
            )
          }
          type="button"
        >
          Open
        </button>
        <button
          aria-label={`Export ${documentId}`}
          className="secondary-action"
          onClick={() =>
            void runDocumentAction(
              () => window.invoiceApp.exportRetainedDocument(documentId),
              "Exported the retained PDF.",
            )
          }
          type="button"
        >
          Export
        </button>
        <button
          aria-label={`Print ${documentId}`}
          className="secondary-action"
          onClick={() =>
            void runDocumentAction(
              () => window.invoiceApp.printRetainedDocument(documentId),
              "Sent the retained PDF to print.",
            )
          }
          type="button"
        >
          Print
        </button>
      </div>
      {feedback ? (
        <p aria-live="polite" className="invoice-history-feedback">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
