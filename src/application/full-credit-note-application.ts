import {
  attachRetainedCreditNotePdf,
  createFullCreditNoteSnapshot,
  reviewFullCreditNote,
  type FullCreditNoteCandidate,
  type FullCreditNoteInput,
} from "../domain/invoices/credit-note.ts";
import type { BusinessTimezone } from "../domain/issuer/issuer-settings.ts";
import type { BusinessDate } from "../domain/time/business-date.ts";
import type {
  FullCreditNoteIssueResult,
  FullCreditNoteReviewResult,
} from "./invoice-application-contract.ts";
import type { CreditNotePdf, WorkspaceRepository, WorkspaceState } from "./workspace.ts";

type FullCreditNoteApplicationOptions = Readonly<{
  currentBusinessDate: (businessTimezone: BusinessTimezone) => BusinessDate;
  currentTimestamp: () => string;
  pdf: CreditNotePdf;
  workspaceRepository: WorkspaceRepository;
}>;

export type FullCreditNoteApplication = Readonly<{
  issue: (
    workspace: WorkspaceState,
    candidate: FullCreditNoteCandidate,
  ) => Promise<FullCreditNoteMutationResult>;
  review: (
    workspace: WorkspaceState,
    input: FullCreditNoteInput,
  ) => Promise<FullCreditNoteReviewResult>;
}>;

export type FullCreditNoteMutationResult =
  | Readonly<{
      kind: "issued";
      creditNote: Extract<FullCreditNoteIssueResult, { kind: "issued" }>["creditNote"];
      workspace: WorkspaceState;
    }>
  | Exclude<FullCreditNoteIssueResult, { kind: "issued" }>;

export function createFullCreditNoteApplication({
  currentBusinessDate,
  currentTimestamp,
  pdf,
  workspaceRepository,
}: FullCreditNoteApplicationOptions): FullCreditNoteApplication {
  async function review(
    workspace: WorkspaceState,
    input: FullCreditNoteInput,
  ): Promise<FullCreditNoteReviewResult> {
    const result = prepareReview(workspace, input, currentBusinessDate);
    if (result.kind === "invalid") return result;

    try {
      return (await pdf.checkFit(result.candidate))
        ? result
        : { kind: "invalid", message: "The credit note does not fit the fixed A4 layout." };
    } catch {
      return { kind: "failed", message: "Could not check the final credit-note layout." };
    }
  }

  async function issue(
    workspace: WorkspaceState,
    candidate: FullCreditNoteCandidate,
  ): Promise<FullCreditNoteMutationResult> {
    const reviewResult = prepareReview(
      workspace,
      {
        issueDate: candidate.issueDate,
        originalInvoiceId: candidate.originalInvoiceId,
        reason: candidate.reason,
      },
      currentBusinessDate,
    );
    if (reviewResult.kind === "invalid") return reviewResult;
    if (!sameCandidate(reviewResult.candidate, candidate)) {
      return { kind: "invalid", message: "The credit note changed. Review it again." };
    }

    try {
      if (!(await pdf.checkFit(candidate))) {
        return { kind: "invalid", message: "The credit note does not fit the fixed A4 layout." };
      }
      const snapshot = createFullCreditNoteSnapshot({
        candidate,
        issuedAt: currentTimestamp(),
      });
      const preparedPdf = await pdf.prepare(snapshot);
      const creditNote = attachRetainedCreditNotePdf({ pdf: preparedPdf.pdf, snapshot });
      const nextWorkspace: WorkspaceState = {
        ...workspace,
        creditNotes: [...workspace.creditNotes, creditNote],
      };
      await workspaceRepository.commitRetainedDocument(
        nextWorkspace,
        { kind: "credit-note", record: creditNote },
        preparedPdf,
      );
      return { kind: "issued", creditNote, workspace: nextWorkspace };
    } catch {
      return {
        kind: "failed",
        message: `The credit note was not issued. ${candidate.id} was not used. Review and try again.`,
      };
    }
  }

  return { issue, review };
}

type PreparedReview = Extract<FullCreditNoteReviewResult, { kind: "ready" | "invalid" }>;

function prepareReview(
  workspace: WorkspaceState,
  input: FullCreditNoteInput,
  currentBusinessDate: (businessTimezone: BusinessTimezone) => BusinessDate,
): PreparedReview {
  const invoice = workspace.issuedInvoices.find(({ id }) => id === input.originalInvoiceId);
  if (!invoice) return { kind: "invalid", message: "Only an issued invoice can be credited." };
  if (workspace.creditNotes.some(({ originalInvoiceId }) => originalInvoiceId === invoice.id)) {
    return { kind: "invalid", message: "This invoice already has a full credit note." };
  }
  return reviewFullCreditNote({
    input,
    invoice,
    today: currentBusinessDate(invoice.issuer.businessTimezone),
  });
}

function sameCandidate(
  reviewedCandidate: FullCreditNoteCandidate,
  submittedCandidate: FullCreditNoteCandidate,
): boolean {
  return JSON.stringify(reviewedCandidate) === JSON.stringify(submittedCandidate);
}
