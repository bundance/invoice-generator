import type { InvoiceIssueReviewResult } from "../../../application/invoice-application-contract.ts";
import type { InvoiceDraftInput } from "../../../domain/invoices/invoice-draft.ts";

type ReadyInvoiceIssueReview = Extract<InvoiceIssueReviewResult, { kind: "ready" }>;

export type InvoiceIssueState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ draft: InvoiceDraftInput; kind: "reviewing"; requestId: number }>
  | Readonly<{
      draft: InvoiceDraftInput;
      kind: "ready";
      requestId: number;
      review: ReadyInvoiceIssueReview;
    }>
  | Readonly<{
      draft: InvoiceDraftInput;
      kind: "issuing";
      review: ReadyInvoiceIssueReview;
    }>
  | Readonly<{ kind: "failed"; message: string }>;

export type InvoiceIssueEvent =
  | Readonly<{ draft: InvoiceDraftInput; requestId: number; type: "review-started" }>
  | Readonly<{
      requestId: number;
      review: ReadyInvoiceIssueReview;
      type: "review-ready";
    }>
  | Readonly<{ message: string; requestId: number; type: "review-failed" }>
  | Readonly<{ type: "issue-started" }>
  | Readonly<{ message: string; type: "issue-failed" }>
  | Readonly<{ type: "cancelled" }>;

export const initialInvoiceIssueState: InvoiceIssueState = { kind: "idle" };

export function transitionInvoiceIssue(
  state: InvoiceIssueState,
  event: InvoiceIssueEvent,
): InvoiceIssueState {
  switch (event.type) {
    case "review-started":
      return startReview(state, event);
    case "review-ready":
      return finishReview(state, event);
    case "review-failed":
      return failReview(state, event);
    case "issue-started":
      return startIssue(state);
    case "issue-failed":
      return failIssue(state, event);
    case "cancelled":
      return state.kind === "issuing" ? state : initialInvoiceIssueState;
  }
}

function startReview(
  state: InvoiceIssueState,
  event: Extract<InvoiceIssueEvent, { type: "review-started" }>,
): InvoiceIssueState {
  return state.kind === "idle" || state.kind === "failed"
    ? { draft: event.draft, kind: "reviewing", requestId: event.requestId }
    : state;
}

function finishReview(
  state: InvoiceIssueState,
  event: Extract<InvoiceIssueEvent, { type: "review-ready" }>,
): InvoiceIssueState {
  return reviewRequestIsCurrent(state, event.requestId)
    ? { ...state, kind: "ready", review: event.review }
    : state;
}

function failReview(
  state: InvoiceIssueState,
  event: Extract<InvoiceIssueEvent, { type: "review-failed" }>,
): InvoiceIssueState {
  return reviewRequestIsCurrent(state, event.requestId)
    ? { kind: "failed", message: event.message }
    : state;
}

function reviewRequestIsCurrent(
  state: InvoiceIssueState,
  requestId: number,
): state is Extract<InvoiceIssueState, { kind: "reviewing" }> {
  return state.kind === "reviewing" && state.requestId === requestId;
}

function startIssue(state: InvoiceIssueState): InvoiceIssueState {
  return state.kind === "ready"
    ? { draft: state.draft, kind: "issuing", review: state.review }
    : state;
}

function failIssue(
  state: InvoiceIssueState,
  event: Extract<InvoiceIssueEvent, { type: "issue-failed" }>,
): InvoiceIssueState {
  return state.kind === "issuing" ? { kind: "failed", message: event.message } : state;
}
