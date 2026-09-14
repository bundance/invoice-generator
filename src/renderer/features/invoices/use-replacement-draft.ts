import { useState } from "react";

import type { ReplacementDraftCreateResult } from "../../../application/invoice-application-contract.ts";
import type { InvoiceId } from "../../../domain/invoices/issued-invoice.ts";

type UseReplacementDraftOptions = Readonly<{
  onCreated: (result: Extract<ReplacementDraftCreateResult, { kind: "created" }>) => void;
  originalInvoiceId: InvoiceId;
}>;

export function useReplacementDraft({ onCreated, originalInvoiceId }: UseReplacementDraftOptions) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hasDraftConflict, setHasDraftConflict] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  async function create(replaceCurrentDraft = false): Promise<void> {
    setFeedback(null);
    setHasDraftConflict(false);
    setIsCreating(true);
    try {
      const result = await (replaceCurrentDraft
        ? window.invoiceApp.replaceDraftWithReplacement(originalInvoiceId)
        : window.invoiceApp.createReplacementDraft(originalInvoiceId));
      if (result.kind === "created") {
        onCreated(result);
        return;
      }
      setFeedback(result.message);
      setHasDraftConflict(result.kind === "conflict");
    } catch {
      setFeedback("Could not create the replacement draft. The correction record is unchanged.");
    } finally {
      setIsCreating(false);
    }
  }

  return {
    create: () => void create(),
    discardAndCreate: () => void create(true),
    feedback,
    hasDraftConflict,
    isCreating,
  };
}
