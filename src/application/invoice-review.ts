import type { Client } from "../domain/clients/client.ts";
import {
  persistedInvoiceDraftSchema,
  reviewInvoiceDraft,
  type InvoiceDraftInput,
  type InvoiceDraftReview,
} from "../domain/invoices/invoice-draft.ts";
import { replacementDraftHasValidSource } from "../domain/invoices/replacement.ts";
import type { IssuerSettings, BusinessTimezone } from "../domain/issuer/issuer-settings.ts";
import type { BusinessDate } from "../domain/time/business-date.ts";
import type { PdfPreviewResult } from "./invoice-application-contract.ts";
import type { InvoicePdf, WorkspaceState } from "./workspace.ts";

export type PreparedIssueReview =
  | Readonly<{
      kind: "ready";
      client: Client;
      review: InvoiceDraftReview & { candidate: NonNullable<InvoiceDraftReview["candidate"]> };
    }>
  | Readonly<{ kind: "invalid"; message: string }>;

export function prepareIssueReview(
  workspace: WorkspaceState,
  input: InvoiceDraftInput,
  currentBusinessDate: (businessTimezone: BusinessTimezone) => BusinessDate,
): PreparedIssueReview {
  const draftResult = persistedInvoiceDraftSchema.safeParse(input);
  if (!draftResult.success || !workspace.issuer) {
    return { kind: "invalid", message: "The invoice draft is not ready to issue." };
  }
  const { client, review } = reviewWorkspaceDraft(
    workspace,
    workspace.issuer,
    draftResult.data,
    currentBusinessDate,
  );
  if (!client || !review.candidate || review.errors.length > 0) {
    return { kind: "invalid", message: "The invoice draft is not ready to issue." };
  }
  if (workspace.issuedInvoices.some(({ id }) => id === review.candidate?.proposedInvoiceId)) {
    return { kind: "invalid", message: "The next invoice ID is already in use." };
  }
  if (!replacementDraftHasValidSource(workspace)) {
    return { kind: "invalid", message: "The replacement link is no longer valid." };
  }
  return {
    kind: "ready",
    client,
    review: { ...review, candidate: review.candidate },
  };
}

export async function previewWorkspaceInvoiceDraft(
  workspace: WorkspaceState,
  input: InvoiceDraftInput,
  pdf: InvoicePdf,
  currentBusinessDate: (businessTimezone: BusinessTimezone) => BusinessDate,
): Promise<PdfPreviewResult> {
  if (!workspace.issuer) {
    return { kind: "invalid", message: "Complete company settings to preview an invoice." };
  }
  const { review } = reviewWorkspaceDraft(workspace, workspace.issuer, input, currentBusinessDate);
  try {
    return { kind: "ready", preview: await pdf.preview(workspace.issuer, review) };
  } catch {
    return { kind: "failed", message: "Could not prepare the invoice preview." };
  }
}

function reviewWorkspaceDraft(
  workspace: WorkspaceState,
  issuer: IssuerSettings,
  draft: InvoiceDraftInput,
  currentBusinessDate: (businessTimezone: BusinessTimezone) => BusinessDate,
) {
  const client = workspace.clients.find(({ id }) => id === draft.clientId);
  return {
    client,
    review: reviewInvoiceDraft({
      client,
      draft,
      issuer,
      today: currentBusinessDate(issuer.businessTimezone),
    }),
  };
}
