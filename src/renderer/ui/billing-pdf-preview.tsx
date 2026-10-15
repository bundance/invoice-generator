import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import {
  useBillingPdfPreview,
  type BillingPdfPreviewRequest,
  type BillingPdfPreviewState,
} from "../hooks/use-billing-pdf-preview.ts";
import { BillingPdfPages, type BillingPdfViewer } from "./billing-pdf-pages.tsx";
import { BillingPdfToolbar } from "./billing-pdf-toolbar.tsx";
import "./billing-pdf-preview.css";

export type { BillingPdfViewerProps } from "./billing-pdf-pages.tsx";

type BillingPdfPreviewProps = Readonly<{
  ariaLabel: string;
  onReadyChange?: (readiness: BillingPdfPreviewReadiness) => void;
  request: BillingPdfPreviewRequest;
  requestKey: string;
}>;

export type BillingPdfPreviewReadiness = Readonly<{
  ready: boolean;
  requestKey: string;
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

export function BillingPdfPreview({
  ariaLabel,
  onReadyChange,
  request,
  requestKey,
}: BillingPdfPreviewProps) {
  const { retry, state } = useBillingPdfPreview(request, requestKey);
  const PdfViewer = useContext(BillingPdfViewerContext);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [viewerFailure, setViewerFailure] = useState<Readonly<{
    message: string;
    requestKey: string;
  }> | null>(null);
  const activeViewerFailure = viewerFailure?.requestKey === requestKey ? viewerFailure : null;
  const notifyReadyChange = useCallback(
    (ready: boolean) => onReadyChange?.({ ready, requestKey }),
    [onReadyChange, requestKey],
  );

  const markReady = useCallback(() => notifyReadyChange(true), [notifyReadyChange]);
  const reportViewerFailure = useCallback(
    (message: string) => {
      setViewerFailure({ message, requestKey });
      notifyReadyChange(false);
    },
    [notifyReadyChange, requestKey],
  );
  const retryPreview = useCallback(() => {
    setViewerFailure(null);
    notifyReadyChange(false);
    retry();
  }, [notifyReadyChange, retry]);

  const displayedState: BillingPdfPreviewState = activeViewerFailure
    ? { kind: "failed", message: activeViewerFailure.message }
    : state;

  return (
    <section
      aria-busy={displayedState.kind === "loading"}
      aria-label={ariaLabel}
      className="preview-panel live-a4-preview-frame"
      data-preview-mode={zoom === "fit" ? "fit" : "manual"}
    >
      <BillingPdfToolbar
        documentId={
          displayedState.kind === "ready" ? displayedState.preview.documentId : "Preparing…"
        }
        onZoomChange={setZoom}
        zoom={zoom}
      />
      {displayedState.kind === "loading" ? (
        <output className="billing-pdf-preview__status">Preparing generated PDF…</output>
      ) : null}
      {displayedState.kind === "failed" ? (
        <div className="billing-pdf-preview__status" role="alert">
          <p>{displayedState.message}</p>
          <button className="secondary-action" onClick={retryPreview} type="button">
            Retry
          </button>
        </div>
      ) : null}
      {displayedState.kind === "ready"
        ? createElement(PdfViewer, {
            bytes: displayedState.preview.bytes,
            onError: reportViewerFailure,
            onReady: markReady,
            zoom,
          })
        : null}
    </section>
  );
}
