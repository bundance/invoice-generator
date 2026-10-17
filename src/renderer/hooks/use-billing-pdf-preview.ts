import { useCallback, useEffect, useEffectEvent, useReducer } from "react";

import type { PdfPreviewResult } from "../../application/invoice-application-contract.ts";
import type { FullCreditNoteInput } from "../../domain/invoices/credit-note.ts";
import type { InvoiceDraftInput } from "../../domain/invoices/invoice-draft.ts";
import { transition, type BillingPdfPreviewState } from "./billing-pdf-preview-state.ts";

export type BillingPdfPreviewRequest =
  | Readonly<{ input: InvoiceDraftInput; kind: "invoice" }>
  | Readonly<{ input: FullCreditNoteInput; kind: "credit-note" }>;

export type BillingPdfPreviewController = Readonly<{
  markDisplayed: () => void;
  reportDisplayFailure: (message: string) => void;
  retry: () => void;
  state: BillingPdfPreviewState;
}>;

const previewDebounceMilliseconds = 180;

export function useBillingPdfPreview(
  request: BillingPdfPreviewRequest | null,
): BillingPdfPreviewController {
  const requestKey = request === null ? null : JSON.stringify(request);
  const [attempt, dispatch] = useReducer(transition, {
    generation: 0,
    requestKey,
    state: { kind: "loading" },
  });
  if (attempt.requestKey !== requestKey) {
    dispatch({ kind: "request-changed", requestKey });
  }
  const { generation } = attempt;
  const loadCurrentPreview = useEffectEvent(() => request && loadPreview(request));

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        let state: BillingPdfPreviewState;
        try {
          const result = await loadCurrentPreview();
          if (!result) return;
          state =
            result.kind === "ready"
              ? { kind: "rendering", preview: result.preview }
              : { kind: "failed", message: result.message };
        } catch {
          state = { kind: "failed", message: "Could not prepare the PDF preview." };
        }
        if (current) {
          dispatch({ kind: "loaded", generation, state });
        }
      })();
    }, previewDebounceMilliseconds);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [generation]);

  const markDisplayed = useCallback(() => {
    dispatch({ kind: "displayed", generation });
  }, [generation]);
  const reportDisplayFailure = useCallback(
    (message: string) => {
      dispatch({ kind: "display-failed", generation, message });
    },
    [generation],
  );
  const retry = useCallback(() => {
    dispatch({ kind: "retry" });
  }, []);

  return { markDisplayed, reportDisplayFailure, retry, state: attempt.state };
}

function loadPreview(request: BillingPdfPreviewRequest): Promise<PdfPreviewResult> {
  switch (request.kind) {
    case "invoice":
      return window.invoiceApp.previewInvoiceDraft(request.input);
    case "credit-note":
      return window.invoiceApp.previewFullCreditNote(request.input);
  }
}
