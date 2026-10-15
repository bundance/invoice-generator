import type { ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../ui/resizable.tsx";

type InvoiceDraftLayoutProps = Readonly<{
  editor: ReactNode;
  preview: ReactNode;
}>;

export function InvoiceDraftLayout({ editor, preview }: InvoiceDraftLayoutProps) {
  return (
    <ResizablePanelGroup
      className="invoice-draft-layout"
      orientation="horizontal"
      style={{ overflow: "visible" }}
    >
      <ResizablePanel id="invoice-preview-panel" minSize={320} style={{ overflow: "visible" }}>
        {preview}
      </ResizablePanel>
      <ResizableHandle aria-label="Resize invoice editor" withHandle />
      <ResizablePanel
        defaultSize={440}
        groupResizeBehavior="preserve-pixel-size"
        id="invoice-editor-panel"
        maxSize={680}
        minSize={360}
        style={{ overflow: "visible" }}
      >
        {editor}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
