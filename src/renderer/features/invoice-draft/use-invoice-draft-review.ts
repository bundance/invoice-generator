import { useReducer, useRef, type FormEvent, type MouseEvent } from "react";

import {
  invoiceDraftInputsAreEqual,
  type InvoiceDraftError,
  type InvoiceDraftFieldName,
  type InvoiceDraftInput,
  type InvoiceDraftReview,
} from "../../../domain/invoices/invoice-draft.ts";

export type DraftSection = "client" | "work" | "tax";

type ReviewState = Readonly<{
  activeSection: DraftSection;
  issueAttempted: boolean;
  reviewedDraft: InvoiceDraftInput | null;
  touchedFields: readonly InvoiceDraftFieldName[];
}>;

type ReviewAction =
  | Readonly<{ type: "discarded" }>
  | Readonly<{ fieldName: InvoiceDraftFieldName; type: "field-touched" }>
  | Readonly<{
      draft: InvoiceDraftInput;
      errorSection: DraftSection | null;
      isValid: boolean;
      type: "issue-reviewed";
    }>
  | Readonly<{ section: DraftSection; type: "section-selected" }>;

const initialReviewState: ReviewState = {
  activeSection: "client",
  issueAttempted: false,
  reviewedDraft: null,
  touchedFields: [],
};

const sectionByField: Readonly<Record<InvoiceDraftFieldName, DraftSection>> = {
  billableDays: "work",
  clientId: "client",
  clientLegalName: "client",
  clientPostalAddress: "client",
  currencyCode: "client",
  dayRate: "work",
  exchangeEffectiveDate: "tax",
  exchangeEvidenceReference: "tax",
  exchangeMethod: "tax",
  exchangeRate: "tax",
  issueDate: "tax",
  notes: "work",
  outsideScopeEvidenceReference: "tax",
  paymentTerms: "client",
  periodEnd: "work",
  periodStart: "work",
  purchaseOrder: "work",
  reverseCharge: "tax",
  serviceDescription: "work",
  taxPoint: "tax",
  vatRate: "tax",
  vatTreatment: "tax",
};

export function useInvoiceDraftReview(
  draft: InvoiceDraftInput,
  review: InvoiceDraftReview,
  onDiscard: () => Promise<boolean>,
  onValidReview: () => void,
) {
  const [state, dispatch] = useReducer(reviewReducer, initialReviewState);
  const summary = useRef<HTMLDivElement>(null);

  function errorFor(fieldName: InvoiceDraftFieldName): string | undefined {
    if (!state.issueAttempted && !state.touchedFields.includes(fieldName)) return undefined;
    return review.errors.find((error) => error.fieldName === fieldName)?.message;
  }

  function reviewForIssue(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    dispatch({
      draft,
      errorSection: errorSection(review.errors[0]),
      isValid: review.errors.length === 0,
      type: "issue-reviewed",
    });
    if (review.errors.length > 0) {
      window.setTimeout(() => summary.current?.focus(), 0);
    } else {
      onValidReview();
    }
  }

  function followErrorLink(event: MouseEvent<HTMLAnchorElement>, error: InvoiceDraftError): void {
    event.preventDefault();
    dispatch({ section: sectionByField[error.fieldName], type: "section-selected" });
    window.setTimeout(() => document.getElementById(`draft-${error.fieldName}`)?.focus(), 0);
  }

  async function discardDraft(): Promise<void> {
    if (await onDiscard()) dispatch({ type: "discarded" });
  }

  return {
    activeSection: state.activeSection,
    draftIsReady: invoiceDraftInputsAreEqual(state.reviewedDraft, draft),
    errorFor,
    followErrorLink,
    issueAttempted: state.issueAttempted,
    onDiscard: () => void discardDraft(),
    onFieldBlur: (fieldName: InvoiceDraftFieldName) =>
      dispatch({ fieldName, type: "field-touched" }),
    onSectionSelect: (section: DraftSection) => dispatch({ section, type: "section-selected" }),
    reviewForIssue,
    summary,
  };
}

function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "discarded":
      return initialReviewState;
    case "field-touched":
      return state.touchedFields.includes(action.fieldName)
        ? state
        : { ...state, touchedFields: [...state.touchedFields, action.fieldName] };
    case "issue-reviewed":
      return {
        ...state,
        activeSection: action.errorSection ?? state.activeSection,
        issueAttempted: true,
        reviewedDraft: action.isValid ? { ...action.draft } : null,
      };
    case "section-selected":
      return { ...state, activeSection: action.section };
  }
}

function errorSection(error: InvoiceDraftError | undefined): DraftSection | null {
  return error ? sectionByField[error.fieldName] : null;
}
