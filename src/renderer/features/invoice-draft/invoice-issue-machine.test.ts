import { describe, expect, it } from "vite-plus/test";

import { createInvoiceDraft, reviewInvoiceDraft } from "../../../domain/invoices/invoice-draft.ts";
import { completeClient } from "../../../../tests/fixtures/client.ts";
import { completeIssuer } from "../../../../tests/fixtures/issuer-settings.ts";
import { businessDate } from "../../app/app-test-support.ts";
import {
  initialInvoiceIssueState,
  transitionInvoiceIssue,
  type InvoiceIssueState,
} from "./invoice-issue-machine.ts";

describe("invoice issue state machine", () => {
  it("carries one reviewed draft through the issue transition", () => {
    const draft = validDraft();
    const review = readyReview(draft);
    const reviewing = transitionInvoiceIssue(initialInvoiceIssueState, {
      draft,
      requestId: 1,
      type: "review-started",
    });
    const ready = transitionInvoiceIssue(reviewing, {
      requestId: 1,
      review,
      type: "review-ready",
    });
    const issuing = transitionInvoiceIssue(ready, { type: "issue-started" });

    expect(issuing).toMatchObject({ draft, kind: "issuing", review });
  });

  it("ignores an asynchronous review result for a different request", () => {
    const draft = validDraft();
    const reviewing = transitionInvoiceIssue(initialInvoiceIssueState, {
      draft,
      requestId: 2,
      type: "review-started",
    });

    expect(
      transitionInvoiceIssue(reviewing, {
        requestId: 1,
        review: readyReview(draft),
        type: "review-ready",
      }),
    ).toBe(reviewing);
  });

  it("cannot cancel an issue that is already committing", () => {
    const issuing: InvoiceIssueState = {
      draft: validDraft(),
      kind: "issuing",
      review: readyReview(validDraft()),
    };

    expect(transitionInvoiceIssue(issuing, { type: "cancelled" })).toBe(issuing);
  });
});

function validDraft() {
  const draft = createInvoiceDraft(completeClient);
  if (draft.vatTreatment !== "outside-scope") throw new Error("Expected outside-scope draft");
  return {
    ...draft,
    issueDate: "2026-09-04",
    serviceLines: [
      {
        ...draft.serviceLines[0],
        billableDays: "4",
        periodEnd: "2026-09-04",
        periodStart: "2026-09-01",
      },
    ] as const,
  };
}

function readyReview(draft: ReturnType<typeof validDraft>) {
  const review = reviewInvoiceDraft({
    client: completeClient,
    draft,
    issuer: completeIssuer,
    today: businessDate,
  });
  if (!review.candidate) throw new Error("Expected a valid invoice review candidate");
  return { candidate: review.candidate, kind: "ready" as const, warnings: review.warnings };
}
