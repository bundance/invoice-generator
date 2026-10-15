import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";

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

type LoadedPdf = Readonly<{ bytes: Uint8Array; document: PDFDocumentProxy }>;

const cssPixelsPerPdfPoint = 96 / 72;

export function BillingPdfPages({ bytes, onError, onReady, zoom }: BillingPdfViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [loadedPdf, setLoadedPdf] = useState<LoadedPdf | null>(null);
  const [fitScale, setFitScale] = useState(cssPixelsPerPdfPoint);
  const fitScaleRef = useRef(fitScale);
  const renderedPagesRef = useRef<RenderedPages>({ pageNumbers: new Set(), renderKey: "" });
  const document = loadedPdf?.bytes === bytes ? loadedPdf.document : null;

  useEffect(() => {
    const loadingTask = getDocument({ data: bytes.slice() });
    let current = true;
    void loadingTask.promise.then(
      (nextDocument) => {
        if (current) setLoadedPdf({ bytes, document: nextDocument });
      },
      (error) => {
        if (current) {
          onError(
            pdfErrorMessage(
              error instanceof Error ? error : new Error("PDF.js returned an unknown error"),
            ),
          );
        }
      },
    );
    return () => {
      current = false;
      void loadingTask.destroy();
    };
  }, [bytes, onError]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !document) return;
    let current = true;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      void document.getPage(1).then(
        (page) => {
          if (!current) return;
          const natural = page.getViewport({ scale: cssPixelsPerPdfPoint });
          const availableWidth = Math.max(0, entry.contentRect.width - 32);
          const availableHeight = Math.max(0, entry.contentRect.height - 32);
          const fitRatio = Math.min(
            availableWidth / natural.width,
            availableHeight / natural.height,
            1,
          );
          const nextFitScale = cssPixelsPerPdfPoint * fitRatio;
          if (nextFitScale !== fitScaleRef.current) {
            fitScaleRef.current = nextFitScale;
            setFitScale(nextFitScale);
          }
        },
        (error) => {
          if (current) {
            onError(
              pdfErrorMessage(
                error instanceof Error ? error : new Error("PDF.js returned an unknown error"),
              ),
            );
          }
        },
      );
    });
    observer.observe(viewport);
    return () => {
      current = false;
      observer.disconnect();
    };
  }, [document, onError]);

  const scale = zoom === "fit" ? fitScale : cssPixelsPerPdfPoint * (zoom / 100);
  const renderKey = document ? `${document.fingerprints[0] ?? "pdf"}:${scale}` : "loading";

  const markPageRendered = useCallback(
    (pageNumber: number, completedRenderKey: string) => {
      if (completedRenderKey !== renderKey) return;
      if (renderedPagesRef.current.renderKey !== completedRenderKey) {
        renderedPagesRef.current = { pageNumbers: new Set(), renderKey: completedRenderKey };
      }
      renderedPagesRef.current.pageNumbers.add(pageNumber);
      if (renderedPagesRef.current.pageNumbers.size === document?.numPages) onReady();
    },
    [document?.numPages, onReady, renderKey],
  );

  const pages = document
    ? Array.from({ length: document.numPages }, (_value, index) => ({
        id: `${document.fingerprints[0] ?? "pdf"}-page-${index + 1}`,
        pageNumber: index + 1,
      }))
    : [];

  return (
    <div className="billing-pdf-preview__viewport" ref={viewportRef}>
      {document
        ? pages.map(({ id, pageNumber }) => (
            <BillingPdfPage
              document={document}
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

function pdfErrorMessage(error: Error): string {
  return error.message
    ? `Could not display the PDF preview: ${error.message}`
    : "Could not display the PDF preview.";
}
