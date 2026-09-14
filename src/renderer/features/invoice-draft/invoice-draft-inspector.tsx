import type { InvoiceIssueResult } from "../../../application/invoice-application-contract.ts";
import type { Client } from "../../../domain/clients/client.ts";
import type {
  InvoiceDraftInput,
  InvoiceDraftReview,
} from "../../../domain/invoices/invoice-draft.ts";
import { FormSaveStatus } from "../../ui/form-controls.tsx";
import { InvoiceClientFields } from "./invoice-client-fields.tsx";
import { InvoiceDraftActions } from "./invoice-draft-actions.tsx";
import { InvoiceDraftContext } from "./invoice-draft-context.tsx";
import { InvoiceDraftFeedback } from "./invoice-draft-feedback.tsx";
import { InvoiceIssueDialog } from "./invoice-issue-dialog.tsx";
import { InvoiceTaxFields } from "./invoice-tax-fields.tsx";
import { InvoiceWorkFields } from "./invoice-work-fields.tsx";
import type { InvoiceDraftForm } from "./use-invoice-draft-form.ts";
import {
  ReplacementDraftNotice,
  type ReplacementDraftNoticeValues,
} from "./replacement-draft-notice.tsx";
import { useInvoiceDraftReview, type DraftSection } from "./use-invoice-draft-review.ts";
import { useInvoiceIssue } from "./use-invoice-issue.ts";

type InvoiceDraftInspectorProps = Readonly<{
  clients: readonly Client[];
  draft: InvoiceDraftInput;
  draftForm: InvoiceDraftForm;
  onDiscard: () => Promise<boolean>;
  onIssued: (result: Extract<InvoiceIssueResult, { kind: "issued" }>) => void;
  review: InvoiceDraftReview;
  selectedClient: Client | undefined;
  replacementNotice: ReplacementDraftNoticeValues | null;
}>;

const sectionLabels: Readonly<Record<DraftSection, string>> = {
  client: "Client",
  work: "Work",
  tax: "Tax & issue",
};

const draftSections: readonly DraftSection[] = ["client", "work", "tax"];

export function InvoiceDraftInspector({
  clients,
  draft,
  draftForm,
  onDiscard,
  onIssued,
  review,
  selectedClient,
  replacementNotice,
}: InvoiceDraftInspectorProps) {
  const issue = useInvoiceIssue({
    draft,
    onIssued: (result) => {
      draftForm.issued(result.client);
      onIssued(result);
    },
    saveBeforeReview: draftForm.saveBeforeReview,
  });
  const reviewState = useInvoiceDraftReview(draft, review, onDiscard, issue.review);

  return (
    <>
      <form
        className="inspector invoice-draft-inspector"
        noValidate
        onSubmit={reviewState.reviewForIssue}
      >
        <header className="draft-inspector-header">
          <div>
            <p className="eyebrow">Unnumbered draft</p>
            <h2>Invoice details</h2>
          </div>
          <FormSaveStatus
            label={draftSaveLabel(draftForm.saveStatus)}
            status={draftForm.saveStatus}
          />
        </header>
        {replacementNotice ? <ReplacementDraftNotice {...replacementNotice} /> : null}

        <fieldset
          className="draft-issue-boundary"
          disabled={issue.state.kind !== "idle" && issue.state.kind !== "failed"}
        >
          <InvoiceDraftContext client={selectedClient} />

          <div className="draft-tabs" role="tablist" aria-label="Invoice sections">
            {draftSections.map((section) => (
              <button
                aria-controls={`draft-${section}-panel`}
                aria-selected={reviewState.activeSection === section}
                id={`draft-${section}-tab`}
                key={section}
                onClick={() => reviewState.onSectionSelect(section)}
                role="tab"
                type="button"
              >
                {sectionLabels[section]}
              </button>
            ))}
          </div>

          <section
            aria-labelledby="draft-client-tab"
            hidden={reviewState.activeSection !== "client"}
            id="draft-client-panel"
            role="tabpanel"
          >
            <InvoiceClientFields
              clients={clients}
              draft={draft}
              draftForm={draftForm}
              errorFor={reviewState.errorFor}
              onFieldBlur={reviewState.onFieldBlur}
            />
          </section>
          <section
            aria-labelledby="draft-work-tab"
            hidden={reviewState.activeSection !== "work"}
            id="draft-work-panel"
            role="tabpanel"
          >
            <InvoiceWorkFields
              draftForm={draftForm}
              errorFor={reviewState.errorFor}
              onFieldBlur={reviewState.onFieldBlur}
            />
          </section>
          <section
            aria-labelledby="draft-tax-tab"
            hidden={reviewState.activeSection !== "tax"}
            id="draft-tax-panel"
            role="tabpanel"
          >
            <InvoiceTaxFields
              draft={draft}
              draftForm={draftForm}
              errorFor={reviewState.errorFor}
              onFieldBlur={reviewState.onFieldBlur}
            />
          </section>

          <InvoiceDraftFeedback
            draftIsReady={reviewState.draftIsReady}
            issueAttempted={reviewState.issueAttempted}
            onErrorFollow={reviewState.followErrorLink}
            review={review}
            summary={reviewState.summary}
          />
          <InvoiceDraftActions
            draftForm={draftForm}
            onDiscard={reviewState.onDiscard}
            reviewInProgress={issue.state.kind === "reviewing"}
            selectedClient={selectedClient}
            trigger={issue.trigger}
          />
        </fieldset>
        {issue.state.kind === "failed" ? (
          <p className="draft-save-error" role="alert">
            {issue.state.message}
          </p>
        ) : null}
      </form>
      {issue.state.kind === "ready" || issue.state.kind === "issuing" ? (
        <InvoiceIssueDialog
          isIssuing={issue.state.kind === "issuing"}
          onCancel={issue.cancel}
          onIssue={(acknowledged) => void issue.issue(acknowledged)}
          review={issue.state.review}
        />
      ) : null}
    </>
  );
}

function draftSaveLabel(status: InvoiceDraftForm["saveStatus"]): string {
  return {
    "not-saved": "Not saved yet",
    saving: "Saving",
    saved: "Saved on this Mac",
    error: "Could not save draft",
  }[status];
}
