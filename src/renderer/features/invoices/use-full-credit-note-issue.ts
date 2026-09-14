import { useState } from "react";

import type {
  FullCreditNoteIssueResult,
  FullCreditNoteReviewResult,
} from "../../../application/invoice-application-contract.ts";
import type {
  FullCreditNoteIssueInput,
  FullCreditNoteInput,
} from "../../../domain/invoices/credit-note.ts";

type ReadyCreditNoteReview = Extract<FullCreditNoteReviewResult, { kind: "ready" }>;

type UseFullCreditNoteIssueOptions = Readonly<{
  input: FullCreditNoteInput;
  onIssued: (result: Extract<FullCreditNoteIssueResult, { kind: "issued" }>) => void;
}>;

export function useFullCreditNoteIssue({ input, onIssued }: UseFullCreditNoteIssueOptions) {
  const [review, setReview] = useState<ReadyCreditNoteReview | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function prepareReview(): Promise<void> {
    setFeedback(null);
    setIsReviewing(true);
    try {
      const result = await window.invoiceApp.reviewFullCreditNote(input);
      if (result.kind === "ready") setReview(result);
      else setFeedback(result.message);
    } catch {
      setFeedback("Could not prepare the final credit-note review.");
    } finally {
      setIsReviewing(false);
    }
  }

  async function issueCreditNote(): Promise<void> {
    if (!review) return;
    setFeedback(null);
    setIsIssuing(true);
    const issueInput: FullCreditNoteIssueInput = { candidate: review.candidate };
    try {
      const result = await window.invoiceApp.issueFullCreditNote(issueInput);
      if (result.kind === "issued") onIssued(result);
      else setFeedback(result.message);
    } catch {
      setFeedback("Could not issue the credit note. Review and try again.");
    } finally {
      setReview(null);
      setIsIssuing(false);
    }
  }

  return {
    cancelReview: () => setReview(null),
    feedback,
    isIssuing,
    isReviewing,
    issueCreditNote: () => void issueCreditNote(),
    prepareReview: () => void prepareReview(),
    review,
  };
}
