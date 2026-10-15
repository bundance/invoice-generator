import { TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from "pdfjs-dist";
import { useEffect, useRef } from "react";

type BillingPdfPageProps = Readonly<{
  document: PDFDocumentProxy;
  onError: (message: string) => void;
  onRendered: (pageNumber: number, renderKey: string) => void;
  pageNumber: number;
  renderKey: string;
  scale: number;
}>;

export function BillingPdfPage({
  document,
  onError,
  onRendered,
  pageNumber,
  renderKey,
  scale,
}: BillingPdfPageProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    let current = true;
    void (async () => {
      try {
        page = await document.getPage(pageNumber);
        const elements = readPageElements(pageRef.current, canvasRef.current, textLayerRef.current);
        if (!current || !elements) return;
        const { pageContainer, canvas, textContainer } = elements;
        const viewport = page.getViewport({ scale });
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;
        pageContainer.style.setProperty("--scale-factor", String(viewport.scale));
        pageContainer.style.setProperty("--user-unit", String(viewport.userUnit));
        pageContainer.style.setProperty(
          "--total-scale-factor",
          "calc(var(--scale-factor) * var(--user-unit))",
        );
        pageContainer.style.setProperty("--scale-round-x", "1px");
        pageContainer.style.setProperty("--scale-round-y", "1px");
        canvas.width = Math.ceil(viewport.width * window.devicePixelRatio);
        canvas.height = Math.ceil(viewport.height * window.devicePixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textContainer.replaceChildren();
        textContainer.style.width = `${viewport.width}px`;
        textContainer.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvas,
          transform: [window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0],
          viewport,
        });
        const canvasRendered = renderTask.promise;
        const [, text] = await Promise.all([canvasRendered, page.getTextContent()]);
        if (current) {
          textLayer = new TextLayer({
            container: textContainer,
            textContentSource: text,
            viewport,
          });
          await textLayer.render();
          if (current) onRendered(pageNumber, renderKey);
        }
      } catch (error: unknown) {
        if (current) {
          onError(
            pdfErrorMessage(
              error instanceof Error ? error : new Error("PDF.js returned an unknown error"),
            ),
          );
        }
      }
    })();
    return () => {
      current = false;
      renderTask?.cancel();
      textLayer?.cancel();
      page?.cleanup();
    };
  }, [document, onError, onRendered, pageNumber, renderKey, scale]);

  return (
    <div aria-label={`PDF page ${pageNumber}`} className="billing-pdf-preview__page" ref={pageRef}>
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textLayerRef} />
    </div>
  );
}

function pdfErrorMessage(error: Error): string {
  return error.message
    ? `Could not display the PDF preview: ${error.message}`
    : "Could not display the PDF preview.";
}

type PdfPageElements = Readonly<{
  canvas: HTMLCanvasElement;
  pageContainer: HTMLDivElement;
  textContainer: HTMLDivElement;
}>;

function readPageElements(
  pageContainer: HTMLDivElement | null,
  canvas: HTMLCanvasElement | null,
  textContainer: HTMLDivElement | null,
): PdfPageElements | null {
  if (!pageContainer || !canvas || !textContainer) return null;
  return { canvas, pageContainer, textContainer };
}
