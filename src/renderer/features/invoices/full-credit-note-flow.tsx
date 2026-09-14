import { useState } from "react";

import type {
  FullCreditNoteIssueResult,
  ReplacementDraftCreateResult,
} from "../../../application/invoice-application-contract.ts";
import { type CreditNote, type FullCreditNoteInput } from "../../../domain/invoices/credit-note.ts";
import type { InvoiceId, IssuedInvoice } from "../../../domain/invoices/issued-invoice.ts";
import type { BusinessDate } from "../../../domain/time/business-date.ts";
import { CreditNoteComplete } from "./credit-note-complete.tsx";
import { FullCreditNoteEditor } from "./full-credit-note-editor.tsx";
import { useFullCreditNoteIssue } from "./use-full-credit-note-issue.ts";
import { useReplacementDraft } from "./use-replacement-draft.ts";

type FullCreditNoteFlowProps = Readonly<{
  creditNote: CreditNote | null;
  currentBusinessDate: BusinessDate;
  invoice: IssuedInvoice;
  onBack: () => void;
  onOpenCurrentDraft: () => void;
  onReplacementCreated: (
    result: Extract<ReplacementDraftCreateResult, { kind: "created" }>,
  ) => void;
  replacementInvoiceId: InvoiceId | null;
  onIssued: (result: Extract<FullCreditNoteIssueResult, { kind: "issued" }>) => void;
}>;

export function FullCreditNoteFlow({
  creditNote,
  currentBusinessDate,
  invoice,
  onBack,
  onOpenCurrentDraft,
  onReplacementCreated,
  replacementInvoiceId,
  onIssued,
}: FullCreditNoteFlowProps) {
  const [issueDateOverride, setIssueDateOverride] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [issuedCreditNote, setIssuedCreditNote] = useState<CreditNote | null>(null);
  const issueDate = issueDateOverride ?? currentBusinessDate;
  const savedCreditNote = creditNote ?? issuedCreditNote;
  const input: FullCreditNoteInput = {
    issueDate,
    originalInvoiceId: invoice.id,
    reason,
  };
  const creditNoteIssue = useFullCreditNoteIssue({
    input,
    onIssued: (result) => {
      setIssuedCreditNote(result.creditNote);
      onIssued(result);
    },
  });
  const replacementDraft = useReplacementDraft({
    onCreated: onReplacementCreated,
    originalInvoiceId: invoice.id,
  });

  if (savedCreditNote) {
    return (
      <CreditNoteComplete
        creditNote={savedCreditNote}
        invoice={invoice}
        onBack={onBack}
        onCreateReplacement={replacementDraft.create}
        onDiscardAndCreateReplacement={replacementDraft.discardAndCreate}
        onOpenCurrentDraft={onOpenCurrentDraft}
        replacementFeedback={replacementDraft.feedback}
        replacementHasDraftConflict={replacementDraft.hasDraftConflict}
        replacementInvoiceId={replacementInvoiceId}
        replacementIsCreating={replacementDraft.isCreating}
      />
    );
  }

  return (
    <FullCreditNoteEditor
      creditNoteIssue={creditNoteIssue}
      currentBusinessDate={currentBusinessDate}
      input={input}
      invoice={invoice}
      onBack={onBack}
      onIssueDateChange={setIssueDateOverride}
      onReasonChange={setReason}
    />
  );
}
