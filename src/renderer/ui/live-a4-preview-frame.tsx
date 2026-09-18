import { ZoomIn, ZoomOut } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";

export type PreviewFontReadiness = Readonly<{
  restart: () => void;
  status: "failed" | "loading" | "ready";
}>;

const minimumZoomPercent = 25;
const maximumZoomPercent = 200;
const zoomStepPercent = 10;

type PreviewZoom = Readonly<{ mode: "fit" }> | Readonly<{ mode: "manual"; percent: number }>;
type PreviewSize = Readonly<{ height: number; width: number }>;
type PreviewLayout = Readonly<{
  fixedPage: HTMLElement;
  output: HTMLOutputElement;
  page: HTMLDivElement;
  previewDocument: HTMLDivElement;
  size: PreviewSize;
  viewport: HTMLDivElement;
}>;

type LiveA4PreviewFrameProps = Readonly<{
  ariaLabel: string;
  children: ReactNode;
  documentId: string;
  fontReadiness: PreviewFontReadiness;
}>;

const fitZoom: PreviewZoom = { mode: "fit" };

export function LiveA4PreviewFrame(props: LiveA4PreviewFrameProps) {
  return <MountedLiveA4PreviewFrame {...props} key={props.documentId} />;
}

function MountedLiveA4PreviewFrame({
  ariaLabel,
  children,
  documentId,
  fontReadiness,
}: LiveA4PreviewFrameProps) {
  const layoutRef = useRef<PreviewLayout>(null);
  const outputRef = useRef<HTMLOutputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const currentScaleRef = useRef(1);
  const [zoom, setZoom] = useState<PreviewZoom>(fitZoom);
  const applyObservedZoom = useEffectEvent((layout: PreviewLayout) => {
    currentScaleRef.current = applyPreviewZoom(layout, zoom);
  });

  useEffect(() => {
    const output = outputRef.current;
    const page = pageRef.current;
    const previewDocument = documentRef.current;
    const viewport = viewportRef.current;
    const fixedPage = previewDocument?.querySelector<HTMLElement>("[data-fit-page]");
    if (!output || !page || !previewDocument || !viewport || !fixedPage) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const layout = {
        fixedPage,
        output,
        page,
        previewDocument,
        size: entry.contentRect,
        viewport,
      };
      layoutRef.current = layout;
      applyObservedZoom(layout);
    });
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      layoutRef.current = null;
    };
  }, []);

  function selectZoom(nextZoom: PreviewZoom): void {
    setZoom(nextZoom);
    if (layoutRef.current) {
      currentScaleRef.current = applyPreviewZoom(layoutRef.current, nextZoom);
    }
  }

  function changeZoomBy(deltaPercent: number): void {
    const currentPercent =
      zoom.mode === "manual" ? zoom.percent : Math.round(currentScaleRef.current * 100);
    selectZoom({
      mode: "manual",
      percent: Math.min(
        maximumZoomPercent,
        Math.max(minimumZoomPercent, currentPercent + deltaPercent),
      ),
    });
  }

  return (
    <section
      aria-busy={fontReadiness.status === "ready" ? undefined : "true"}
      aria-label={ariaLabel}
      className="preview-panel live-a4-preview-frame"
      data-font-status={fontReadiness.status}
      data-preview-mode={zoom.mode}
    >
      <div className="preview-toolbar">
        <div className="preview-toolbar__identity">
          <span>Live A4 preview</span>
          <small>{documentId}</small>
        </div>
        <fieldset aria-label="Preview zoom" className="preview-zoom-controls">
          <button
            aria-label="Fit preview"
            aria-pressed={zoom.mode === "fit"}
            onClick={() => selectZoom(fitZoom)}
            type="button"
          >
            Fit
          </button>
          <button
            aria-label="Zoom out"
            disabled={zoom.mode === "manual" && zoom.percent === minimumZoomPercent}
            onClick={() => changeZoomBy(-zoomStepPercent)}
            type="button"
          >
            <ZoomOut aria-hidden="true" />
          </button>
          <output aria-label="Current zoom" ref={outputRef}>
            —
          </output>
          <button
            aria-label="Zoom in"
            disabled={zoom.mode === "manual" && zoom.percent === maximumZoomPercent}
            onClick={() => changeZoomBy(zoomStepPercent)}
            type="button"
          >
            <ZoomIn aria-hidden="true" />
          </button>
        </fieldset>
      </div>
      <div className="live-a4-preview-viewport" ref={viewportRef}>
        {fontReadiness.status === "loading" ? (
          <output className="live-a4-preview-font-status">Preparing document fonts…</output>
        ) : null}
        {fontReadiness.status === "failed" ? (
          <div className="live-a4-preview-font-status" role="alert">
            <p>The document fonts could not be prepared.</p>
            <button
              aria-label="Retry document fonts"
              className="secondary-action"
              onClick={fontReadiness.restart}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}
        <div className="live-a4-preview-page" ref={pageRef} style={{ height: 0, width: 0 }}>
          <div
            aria-hidden={fontReadiness.status === "ready" ? undefined : "true"}
            className="live-a4-preview-document"
            ref={documentRef}
            style={{ transform: "scale(0)" }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Keeps geometry and the readout in sync even when React defers renders during native resize. */
function applyPreviewZoom(layout: PreviewLayout, zoom: PreviewZoom): number {
  const { fixedPage, output, page, previewDocument, size, viewport } = layout;
  const fixedPageHeight = fixedPage.offsetHeight;
  const fixedPageWidth = fixedPage.offsetWidth;
  if (size.height <= 0 || size.width <= 0 || fixedPageHeight <= 0 || fixedPageWidth <= 0) return 1;

  const scale =
    zoom.mode === "manual"
      ? zoom.percent / 100
      : Math.min(size.width / fixedPageWidth, size.height / fixedPageHeight, 1);
  page.style.height = `${fixedPageHeight * scale}px`;
  page.style.width = `${fixedPageWidth * scale}px`;
  previewDocument.style.transform = `scale(${scale})`;
  output.value = `${Math.round(scale * 100)}%`;
  if (zoom.mode === "fit") {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
  return scale;
}
