import { type ReactNode, useEffect, useRef, useState } from "react";

type LiveA4PreviewFrameProps = Readonly<{
  ariaLabel: string;
  children: ReactNode;
  documentId: string;
}>;

const a4WidthPixels = (210 / 25.4) * 96;
const a4HeightPixels = (297 / 25.4) * 96;

export function LiveA4PreviewFrame({ ariaLabel, children, documentId }: LiveA4PreviewFrameProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { height, width } = entry.contentRect;
      if (height <= 0 || width <= 0) return;
      setScale(Math.min(width / a4WidthPixels, height / a4HeightPixels, 1));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-busy={scale === 0}
      aria-label={ariaLabel}
      className="preview-panel live-a4-preview-frame"
      data-preview-mode="fit"
    >
      <div className="preview-toolbar">
        <span>Live A4 preview</span>
        <small>{documentId}</small>
      </div>
      <div className="live-a4-preview-viewport" ref={viewportRef}>
        <div
          className="live-a4-preview-page"
          style={{
            height: `${a4HeightPixels * scale}px`,
            width: `${a4WidthPixels * scale}px`,
          }}
        >
          <div className="live-a4-preview-document" style={{ transform: `scale(${scale})` }}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
