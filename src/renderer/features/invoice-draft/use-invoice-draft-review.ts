import { useReducer, useRef, type FormEvent, type MouseEvent } from "react";

import {
  invoiceDraftInputsAreEqual,
  parseInvoiceDraftInput,
  type InvoiceDraftError,
  type InvoiceDraftFieldName,
  type InvoiceDraftInput,
  type InvoiceDraftReview,
} from "../../../domain/invoices/invoice-draft.ts";
import type { InvoiceServiceLineFieldName } from "../../../domain/invoices/invoice-service-line.ts";
import type { InvoiceDraftItems } from "./use-invoice-draft-items.ts";

export type DraftSection = "client" | "work" | "tax";

type ReviewState = Readonly<{
  activeSection: DraftSection;
  issueAttempted: boolean;
  reviewedDraft: InvoiceDraftInput | null;
  touchedFields: readonly string[];
}>;

type ReviewAction =
  | Readonly<{ type: "discarded" }>
  | Readonly<{ fieldKey: string; type: "field-touched" }>
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

export function useInvoiceDraftReview(
  draft: InvoiceDraftInput,
  review: InvoiceDraftReview,
  items: InvoiceDraftItems,
  onDiscard: () => Promise<boolean>,
  onValidReview: () => void,
) {
  const [state, dispatch] = useReducer(reviewReducer, initialReviewState);
  const summary = useRef<HTMLDivElement>(null);

  function errorFor(fieldName: InvoiceDraftFieldName): string | undefined {
    if (!state.issueAttempted && !state.touchedFields.includes(fieldName)) return undefined;
    return review.errors.find(
      (error) => error.location.kind === "invoice" && error.location.fieldName === fieldName,
    )?.message;
  }

  function serviceLineErrorFor(
    serviceLineIndex: number,
    fieldId: string,
    fieldName: InvoiceServiceLineFieldName,
  ): string | undefined {
    if (!state.issueAttempted && !state.touchedFields.includes(lineFieldKey(fieldId, fieldName))) {
      return undefined;
    }
    return review.errors.find(
      (error) =>
        error.location.kind === "service-line" &&
        error.location.serviceLineIndex === serviceLineIndex &&
        error.location.fieldName === fieldName,
    )?.message;
  }

  function reviewForIssue(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    dispatch({
      draft: parseInvoiceDraftInput(draft),
      errorSection: errorSection(review.errors[0]),
      isValid: review.errors.length === 0,
      type: "issue-reviewed",
    });
    if (review.errors.length > 0) {
      focusError(review.errors[0]);
    } else {
      onValidReview();
    }
  }

  function followErrorLink(event: MouseEvent<HTMLAnchorElement>, error: InvoiceDraftError): void {
    event.preventDefault();
    focusError(error);
  }

  function focusError(error: InvoiceDraftError | undefined): void {
    if (!error) return;
    if (error.location.kind === "service-line") {
      const fieldId = items.fieldIdAt(error.location.serviceLineIndex);
      const fieldName = error.location.fieldName;
      if (!fieldId) return;
      dispatch({ section: "work", type: "section-selected" });
      items.openItem(fieldId);
      window.setTimeout(() => document.getElementById(lineInputId(fieldId, fieldName))?.focus(), 0);
      return;
    }
    dispatch({ section: invoiceFieldSection(error.location.fieldName), type: "section-selected" });
    window.setTimeout(
      () => document.getElementById(`draft-${error.location.fieldName}`)?.focus(),
      0,
    );
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
      dispatch({ fieldKey: fieldName, type: "field-touched" }),
    onSectionSelect: (section: DraftSection) => dispatch({ section, type: "section-selected" }),
    onServiceLineFieldBlur: (fieldId: string, fieldName: InvoiceServiceLineFieldName) =>
      dispatch({ fieldKey: lineFieldKey(fieldId, fieldName), type: "field-touched" }),
    reviewForIssue,
    serviceLineErrorFor,
    summary,
  };
}

function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "discarded":
      return initialReviewState;
    case "field-touched":
      return state.touchedFields.includes(action.fieldKey)
        ? state
        : { ...state, touchedFields: [...state.touchedFields, action.fieldKey] };
    case "issue-reviewed":
      return {
        ...state,
        activeSection: action.errorSection ?? state.activeSection,
        issueAttempted: true,
        reviewedDraft: action.isValid ? action.draft : null,
      };
    case "section-selected":
      return { ...state, activeSection: action.section };
  }
}

function errorSection(error: InvoiceDraftError | undefined): DraftSection | null {
  if (!error) return null;
  return error.location.kind === "service-line"
    ? "work"
    : invoiceFieldSection(error.location.fieldName);
}

function invoiceFieldSection(fieldName: InvoiceDraftFieldName): DraftSection {
  if (
    fieldName === "clientId" ||
    fieldName === "clientLegalName" ||
    fieldName === "clientPostalAddress" ||
    fieldName === "currencyCode" ||
    fieldName === "paymentTerms"
  ) {
    return "client";
  }
  return fieldName === "notes" || fieldName === "purchaseOrder" ? "work" : "tax";
}

function lineFieldKey(fieldId: string, fieldName: InvoiceServiceLineFieldName): string {
  return `${fieldId}:${fieldName}`;
}

export function lineInputId(fieldId: string, fieldName: InvoiceServiceLineFieldName): string {
  return `draft-${fieldId}-${fieldName}`;
}
