import { ZoomIn, ZoomOut } from "lucide-react";

const minimumZoomPercent = 25;
const maximumZoomPercent = 200;
const zoomStepPercent = 25;

type BillingPdfToolbarProps = Readonly<{
  documentId: string;
  onZoomChange: (zoom: "fit" | number) => void;
  zoom: "fit" | number;
}>;

export function BillingPdfToolbar({ documentId, onZoomChange, zoom }: BillingPdfToolbarProps) {
  function fitPreview() {
    onZoomChange("fit");
  }
  function zoomOut() {
    onZoomChange(changeZoom(zoom, -zoomStepPercent));
  }
  function zoomIn() {
    onZoomChange(changeZoom(zoom, zoomStepPercent));
  }

  return (
    <div className="preview-toolbar">
      <div className="preview-toolbar__identity">
        <span>Generated PDF preview</span>
        <small>{documentId}</small>
      </div>
      <fieldset aria-label="Preview zoom" className="preview-zoom-controls">
        <button
          aria-label="Fit preview"
          aria-pressed={zoom === "fit"}
          onClick={fitPreview}
          type="button"
        >
          Fit
        </button>
        <button
          aria-label="Zoom out"
          disabled={zoom === minimumZoomPercent}
          onClick={zoomOut}
          type="button"
        >
          <ZoomOut aria-hidden="true" />
        </button>
        <output aria-label="Current zoom">{zoom === "fit" ? "Fit" : `${zoom}%`}</output>
        <button
          aria-label="Zoom in"
          disabled={zoom === maximumZoomPercent}
          onClick={zoomIn}
          type="button"
        >
          <ZoomIn aria-hidden="true" />
        </button>
      </fieldset>
    </div>
  );
}

function changeZoom(current: "fit" | number, delta: number): number {
  const percent = current === "fit" ? 100 : current;
  return Math.min(maximumZoomPercent, Math.max(minimumZoomPercent, percent + delta));
}
