import { useCallback, useEffect, useEffectEvent, useState } from "react";

import type { PdfPreviewResult } from "../../application/invoice-application-contract.ts";
import type { PdfPreview } from "../../application/workspace.ts";

export type BillingPdfPreviewRequest =
  | Readonly<{
      input: Parameters<Window["invoiceApp"]["previewInvoiceDraft"]>[0];
      kind: "invoice";
    }>
  | Readonly<{
      input: Parameters<Window["invoiceApp"]["previewFullCreditNote"]>[0];
      kind: "credit-note";
    }>;

export type BillingPdfPreviewState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; preview: PdfPreview }>
  | Readonly<{ kind: "failed"; message: string }>;

type PreviewResultState = Readonly<{
  result: BillingPdfPreviewState;
  version: string;
}>;

export type BillingPdfPreviewController = Readonly<{
  retry: () => void;
  state: BillingPdfPreviewState;
}>;

export function useBillingPdfPreview(
  request: BillingPdfPreviewRequest,
  requestKey: string,
): BillingPdfPreviewController {
  const [retryCount, setRetryCount] = useState(0);
  const [resultState, setResultState] = useState<PreviewResultState | null>(null);
  const version = `${requestKey}:${retryCount}`;
  const loadCurrentPreview = useEffectEvent(() => loadPreview(request));

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void loadCurrentPreview().then(
        (result) => {
          if (!current) return;
          setResultState({
            result:
              result.kind === "ready"
                ? { kind: "ready", preview: result.preview }
                : { kind: "failed", message: result.message },
            version,
          });
        },
        () => {
          if (!current) return;
          setResultState({
            result: { kind: "failed", message: "Could not prepare the PDF preview." },
            version,
          });
        },
      );
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [version]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  return {
    retry,
    state: resultState?.version === version ? resultState.result : { kind: "loading" },
  };
}

function loadPreview(request: BillingPdfPreviewRequest): Promise<PdfPreviewResult> {
  switch (request.kind) {
    case "invoice":
      return window.invoiceApp.previewInvoiceDraft(request.input);
    case "credit-note":
      return window.invoiceApp.previewFullCreditNote(request.input);
  }
}
