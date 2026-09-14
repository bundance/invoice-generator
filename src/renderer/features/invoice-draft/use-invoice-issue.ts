import { useReducer, useRef } from "react";

import type { InvoiceIssueResult } from "../../../application/invoice-application-contract.ts";
import type { InvoiceDraftInput } from "../../../domain/invoices/invoice-draft.ts";
import { initialInvoiceIssueState, transitionInvoiceIssue } from "./invoice-issue-machine.ts";

type UseInvoiceIssueOptions = Readonly<{
  draft: InvoiceDraftInput;
  onIssued: (result: Extract<InvoiceIssueResult, { kind: "issued" }>) => void;
  saveBeforeReview: (draft: InvoiceDraftInput) => Promise<boolean>;
}>;

export function useInvoiceIssue({ draft, onIssued, saveBeforeReview }: UseInvoiceIssueOptions) {
  const [state, dispatch] = useReducer(transitionInvoiceIssue, initialInvoiceIssueState);
  const nextReviewRequestId = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);

  async function review(): Promise<void> {
    const requestId = ++nextReviewRequestId.current;
    const reviewedDraft = { ...draft };
    dispatch({ draft: reviewedDraft, requestId, type: "review-started" });
    try {
      if (!(await saveBeforeReview(reviewedDraft))) {
        dispatch({
          message: "Save the latest draft before preparing the final issue review.",
          requestId,
          type: "review-failed",
        });
        return;
      }
      const result = await window.invoiceApp.reviewInvoiceIssue(reviewedDraft);
      dispatch(
        result.kind === "ready"
          ? { requestId, review: result, type: "review-ready" }
          : { message: result.message, requestId, type: "review-failed" },
      );
    } catch {
      dispatch({
        message: "Could not prepare the final issue review.",
        requestId,
        type: "review-failed",
      });
    }
  }

  function cancel(): void {
    dispatch({ type: "cancelled" });
    window.setTimeout(() => trigger.current?.focus(), 0);
  }

  async function issue(lateIssueDateAcknowledged: boolean): Promise<void> {
    if (state.kind !== "ready") return;
    dispatch({ type: "issue-started" });
    try {
      const result = await window.invoiceApp.issueInvoice({
        draft: state.draft,
        expectedInvoiceId: state.review.candidate.proposedInvoiceId,
        lateIssueDateAcknowledged,
      });
      if (result.kind === "issued") {
        onIssued(result);
        return;
      }
      dispatch({ message: result.message, type: "issue-failed" });
    } catch {
      dispatch({
        message:
          "The app could not confirm whether the invoice was issued. Check invoice history before trying again.",
        type: "issue-failed",
      });
    }
  }

  return {
    cancel,
    issue,
    review: () => void review(),
    state,
    trigger,
  };
}
