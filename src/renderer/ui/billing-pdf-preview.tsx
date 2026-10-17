import { createElement, createContext, useContext, useState, type ReactNode } from "react";

import type { BillingPdfPreviewController } from "../hooks/use-billing-pdf-preview.ts";
import { BillingPdfPages, type BillingPdfViewer } from "./billing-pdf-pages.tsx";
import { BillingPdfToolbar } from "./billing-pdf-toolbar.tsx";
import "./billing-pdf-preview.css";

export type { BillingPdfViewerProps } from "./billing-pdf-pages.tsx";

type BillingPdfPreviewProps = Readonly<{
  ariaLabel: string;
  preview: BillingPdfPreviewController;
}>;

const BillingPdfViewerContext = createContext<BillingPdfViewer>(BillingPdfPages);

export function BillingPdfViewerProvider({
  children,
  viewer,
}: Readonly<{ children?: ReactNode; viewer: BillingPdfViewer }>) {
  return (
    <BillingPdfViewerContext.Provider value={viewer}>{children}</BillingPdfViewerContext.Provider>
  );
}

export function BillingPdfPreview({ ariaLabel, preview }: BillingPdfPreviewProps) {
  const { markDisplayed, reportDisplayFailure, retry, state } = preview;
  const PdfViewer = useContext(BillingPdfViewerContext);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const hasPdf = state.kind === "rendering" || state.kind === "displayed";

  return (
    <section
      aria-busy={state.kind === "loading" || state.kind === "rendering"}
      aria-label={ariaLabel}
      className="preview-panel billing-pdf-preview"
      data-preview-mode={zoom === "fit" ? "fit" : "manual"}
    >
      <BillingPdfToolbar
        documentId={hasPdf ? state.preview.documentId : "Preparing…"}
        onZoomChange={setZoom}
        zoom={zoom}
      />
      {state.kind === "loading" ? (
        <output className="billing-pdf-preview__status">Preparing generated PDF…</output>
      ) : null}
      {state.kind === "failed" ? (
        <div className="billing-pdf-preview__status" role="alert">
          <p>{state.message}</p>
          <button className="secondary-action" onClick={retry} type="button">
            Retry
          </button>
        </div>
      ) : null}
      {hasPdf
        ? createElement(PdfViewer, {
            bytes: state.preview.bytes,
            onError: reportDisplayFailure,
            onReady: markDisplayed,
            zoom,
          })
        : null}
    </section>
  );
}
