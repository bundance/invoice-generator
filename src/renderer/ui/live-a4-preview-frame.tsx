import { type ReactNode, useEffect, useRef } from "react";

type LiveA4PreviewFrameProps = Readonly<{
  ariaLabel: string;
  children: ReactNode;
  documentId: string;
}>;

export function LiveA4PreviewFrame({ ariaLabel, children, documentId }: LiveA4PreviewFrameProps) {
  const frameRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const page = pageRef.current;
    const previewDocument = documentRef.current;
    const viewport = viewportRef.current;
    const fixedPage = previewDocument?.querySelector<HTMLElement>("[data-fit-page]");
    if (!frame || !page || !previewDocument || !viewport || !fixedPage) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { height, width } = entry.contentRect;
      const fixedPageHeight = fixedPage.offsetHeight;
      const fixedPageWidth = fixedPage.offsetWidth;
      if (height <= 0 || width <= 0 || fixedPageHeight <= 0 || fixedPageWidth <= 0) return;
      const scale = Math.min(width / fixedPageWidth, height / fixedPageHeight, 1);
      page.style.height = `${fixedPageHeight * scale}px`;
      page.style.width = `${fixedPageWidth * scale}px`;
      previewDocument.style.transform = `scale(${scale})`;
      frame.removeAttribute("aria-busy");
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-busy="true"
      aria-label={ariaLabel}
      className="preview-panel live-a4-preview-frame"
      data-preview-mode="fit"
      ref={frameRef}
    >
      <div className="preview-toolbar">
        <span>Live A4 preview</span>
        <small>{documentId}</small>
      </div>
      <div className="live-a4-preview-viewport" ref={viewportRef}>
        <div className="live-a4-preview-page" ref={pageRef} style={{ height: 0, width: 0 }}>
          <div
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
