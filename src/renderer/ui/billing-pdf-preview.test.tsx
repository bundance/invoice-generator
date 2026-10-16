import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { completeInvoiceDraftInput } from "../../../tests/fixtures/issued-invoice.ts";
import { testInvoiceAppCommands } from "../app/app-test-support.ts";
import { useBillingPdfPreview } from "../hooks/use-billing-pdf-preview.ts";
import {
  BillingPdfPreview,
  BillingPdfViewerProvider,
  type BillingPdfViewerProps,
} from "./billing-pdf-preview.tsx";

describe("billing PDF viewer lifecycle", () => {
  afterEach(cleanup);

  it("preserves viewer state through display completion and zoom", async () => {
    window.invoiceApp = testInvoiceAppCommands;
    const user = userEvent.setup();
    render(
      <BillingPdfViewerProvider viewer={StatefulViewer}>
        <PreviewHarness />
      </BillingPdfViewerProvider>,
    );
    expect(screen.getByText("Preparing generated PDF…")).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "Viewed pages 0" }));
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Viewed pages 1" })).toBeVisible();
    expect(screen.getByLabelText("Preview lifecycle")).toHaveTextContent("displayed");
  });

  it("keeps a displayed document ready when Fit is already selected", async () => {
    window.invoiceApp = testInvoiceAppCommands;
    const user = userEvent.setup();
    render(
      <BillingPdfViewerProvider viewer={ReadyViewer}>
        <PreviewHarness />
      </BillingPdfViewerProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Preview lifecycle")).toHaveTextContent("displayed"),
    );
    await user.click(screen.getByRole("button", { name: "Fit preview" }));
    expect(screen.getByLabelText("Preview lifecycle")).toHaveTextContent("displayed");
  });

  it("keeps a render failure failed and retries generation", async () => {
    let generation = 0;
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      previewInvoiceDraft: () =>
        Promise.resolve({
          kind: "ready",
          preview: { bytes: new Uint8Array([++generation]), documentId: `Draft ${generation}` },
        }),
    };
    const user = userEvent.setup();
    render(
      <BillingPdfViewerProvider viewer={FailingThenReadyViewer}>
        <PreviewHarness />
      </BillingPdfViewerProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Canvas render failed");
    expect(screen.getByLabelText("Preview lifecycle")).toHaveTextContent("failed");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Preparing generated PDF…")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText("Preview lifecycle")).toHaveTextContent("displayed"),
    );
    expect(generation).toBe(2);
  });
});

function PreviewHarness() {
  const preview = useBillingPdfPreview({ kind: "invoice", input: completeInvoiceDraftInput });
  return (
    <>
      <output aria-label="Preview lifecycle">{preview.state.kind}</output>
      <BillingPdfPreview ariaLabel="Invoice preview" preview={preview} />
    </>
  );
}

function ReadyViewer({ onReady }: BillingPdfViewerProps) {
  useEffect(onReady, [onReady]);
  return <div aria-label="Rendered PDF pages">1 PDF page</div>;
}

function FailingThenReadyViewer({ bytes, onError, onReady }: BillingPdfViewerProps) {
  useEffect(() => {
    if (bytes[0] === 1) {
      onError("Could not display the PDF preview: Canvas render failed");
      onReady();
    } else onReady();
  }, [bytes, onError, onReady]);
  return <div aria-label="Rendered PDF pages">1 PDF page</div>;
}

function StatefulViewer({ onReady }: BillingPdfViewerProps) {
  const [viewedPages, setViewedPages] = useState(0);
  useEffect(onReady, [onReady]);
  function recordViewedPage() {
    setViewedPages((count) => count + 1);
  }
  return (
    <button type="button" onClick={recordViewedPage}>
      Viewed pages {viewedPages}
    </button>
  );
}
