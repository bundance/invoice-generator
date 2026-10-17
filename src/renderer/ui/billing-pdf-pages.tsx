import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";

import { describePdfJsError } from "./pdf-js-error.ts";
import { BillingPdfPage } from "./billing-pdf-page.tsx";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type BillingPdfViewerProps = Readonly<{
  bytes: Uint8Array;
  onError: (message: string) => void;
  onReady: () => void;
  zoom: "fit" | number;
}>;

export type BillingPdfViewer = ComponentType<BillingPdfViewerProps>;

type RenderedPages = {
  pageNumbers: Set<number>;
  renderKey: string;
};

type LoadedPdf = Readonly<{
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  naturalWidth: number;
  naturalHeight: number;
}>;

const cssPixelsPerPdfPoint = 96 / 72;

export function BillingPdfPages({ bytes, onError, onReady, zoom }: BillingPdfViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [loadedPdf, setLoadedPdf] = useState<LoadedPdf | null>(null);
  const [fitScale, setFitScale] = useState(cssPixelsPerPdfPoint);
  const renderedPagesRef = useRef<RenderedPages>({ pageNumbers: new Set(), renderKey: "" });
  const activePdf = loadedPdf?.bytes === bytes ? loadedPdf : null;
  const pdf = activePdf?.pdf;

  useEffect(() => {
    const loadingTask = getDocument({ data: bytes.slice() });
    let current = true;
    void (async () => {
      try {
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const natural = page.getViewport({ scale: cssPixelsPerPdfPoint });
        if (current)
          setLoadedPdf({ bytes, pdf, naturalWidth: natural.width, naturalHeight: natural.height });
      } catch (error) {
        if (current) onError(describePdfJsError(error));
      }
    })();
    return () => {
      current = false;
      void loadingTask.destroy();
    };
  }, [bytes, onError]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !activePdf) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const availableWidth = Math.max(0, entry.contentRect.width - 32);
      const availableHeight = Math.max(0, entry.contentRect.height - 32);
      const fitRatio = Math.min(
        availableWidth / activePdf.naturalWidth,
        availableHeight / activePdf.naturalHeight,
        1,
      );
      setFitScale(cssPixelsPerPdfPoint * fitRatio);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [activePdf]);

  const scale = zoom === "fit" ? fitScale : cssPixelsPerPdfPoint * (zoom / 100);
  const renderKey = pdf ? `${pdf.fingerprints[0] ?? "pdf"}:${scale}` : "loading";

  const markPageRendered = useCallback(
    (pageNumber: number, completedRenderKey: string) => {
      if (completedRenderKey !== renderKey) return;
      if (renderedPagesRef.current.renderKey !== completedRenderKey) {
        renderedPagesRef.current = { pageNumbers: new Set(), renderKey: completedRenderKey };
      }
      renderedPagesRef.current.pageNumbers.add(pageNumber);
      if (renderedPagesRef.current.pageNumbers.size === pdf?.numPages) onReady();
    },
    [pdf?.numPages, onReady, renderKey],
  );

  const pages = pdf
    ? Array.from({ length: pdf.numPages }, (_value, index) => ({
        id: `${pdf.fingerprints[0] ?? "pdf"}-page-${index + 1}`,
        pageNumber: index + 1,
      }))
    : [];

  return (
    <div className="billing-pdf-preview__viewport" ref={viewportRef}>
      {pdf
        ? pages.map(({ id, pageNumber }) => (
            <BillingPdfPage
              pdf={pdf}
              key={id}
              onError={onError}
              onRendered={markPageRendered}
              pageNumber={pageNumber}
              renderKey={renderKey}
              scale={scale}
            />
          ))
        : null}
    </div>
  );
}
