import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { persistedInvoiceDraftSchema } from "../../domain/invoices/invoice-draft.ts";
import { completeInvoiceDraftInput } from "../../../tests/fixtures/issued-invoice.ts";
import { testInvoiceAppCommands } from "../app/app-test-support.ts";
import {
  BillingPdfPreview,
  BillingPdfViewerProvider,
  type BillingPdfPreviewReadiness,
  type BillingPdfViewerProps,
} from "./billing-pdf-preview.tsx";

describe("billing PDF viewer lifecycle", () => {
  afterEach(cleanup);

  it("mounts a Hook-using viewer after generation and preserves its own state on zoom", async () => {
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      previewInvoiceDraft: () =>
        Promise.resolve({
          kind: "ready",
          preview: { bytes: new Uint8Array([2]), documentId: "Draft invoice", pageCount: 1 },
        }),
    };
    const draft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const user = userEvent.setup();
    render(
      <BillingPdfViewerProvider viewer={StatefulViewer}>
        <BillingPdfPreview
          ariaLabel="Invoice preview"
          request={{ input: draft, kind: "invoice" }}
          requestKey="draft"
        />
      </BillingPdfViewerProvider>,
    );

    expect(screen.getByText("Preparing generated PDF…")).toBeVisible();
    const viewerButton = await screen.findByRole("button", { name: "Viewed pages 0" });
    await user.click(viewerButton);
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Viewed pages 1" })).toBeVisible();
  });

  it("keeps a ready document ready when Fit is already selected", async () => {
    const readiness: BillingPdfPreviewReadiness[] = [];
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      previewInvoiceDraft: () =>
        Promise.resolve({
          kind: "ready",
          preview: {
            bytes: new Uint8Array([2]),
            documentId: "Draft invoice",
            pageCount: 1,
          },
        }),
    };
    const draft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const user = userEvent.setup();
    render(
      <BillingPdfViewerProvider viewer={ReadyViewer}>
        <BillingPdfPreview
          ariaLabel="Invoice preview"
          onReadyChange={(nextReadiness) => readiness.push(nextReadiness)}
          request={{ input: draft, kind: "invoice" }}
          requestKey="draft"
        />
      </BillingPdfViewerProvider>,
    );

    await waitFor(() => expect(readiness.at(-1)).toEqual({ ready: true, requestKey: "draft" }));
    const readinessBeforeClick = [...readiness];
    await user.click(screen.getByRole("button", { name: "Fit preview" }));
    expect(readiness).toEqual(readinessBeforeClick);
  });

  it("keeps the document unready after a render failure and retries generation", async () => {
    let generation = 0;
    const readiness: BillingPdfPreviewReadiness[] = [];
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      previewInvoiceDraft: () => {
        generation += 1;
        return Promise.resolve({
          kind: "ready",
          preview: {
            bytes: new Uint8Array([generation]),
            documentId: `Draft ${generation}`,
            pageCount: 1,
          },
        });
      },
    };
    const draft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const user = userEvent.setup();
    render(
      <BillingPdfViewerProvider viewer={FailingThenReadyViewer}>
        <BillingPdfPreview
          ariaLabel="Invoice preview"
          onReadyChange={(nextReadiness) => readiness.push(nextReadiness)}
          request={{ input: draft, kind: "invoice" }}
          requestKey="draft"
        />
      </BillingPdfViewerProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Canvas render failed");
    expect(readiness).not.toContainEqual({ ready: true, requestKey: "draft" });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Preparing generated PDF…")).toBeVisible();
    await screen.findByLabelText("Rendered PDF pages");
    await waitFor(() => expect(readiness.at(-1)).toEqual({ ready: true, requestKey: "draft" }));
    expect(generation).toBe(2);
  });
});

function ReadyViewer({ onReady }: BillingPdfViewerProps) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return <div aria-label="Rendered PDF pages">1 PDF page</div>;
}

function FailingThenReadyViewer({ bytes, onError, onReady }: BillingPdfViewerProps) {
  useEffect(() => {
    const resultTimer = window.setTimeout(() => {
      if (bytes[0] === 1) onError("Could not display the PDF preview: Canvas render failed");
      else onReady();
    }, 0);
    return () => window.clearTimeout(resultTimer);
  }, [bytes, onError, onReady]);
  return <div aria-label="Rendered PDF pages">1 PDF page</div>;
}

function StatefulViewer({ onReady }: BillingPdfViewerProps) {
  const [viewedPages, setViewedPages] = useState(0);
  useEffect(() => onReady(), [onReady]);
  function recordViewedPage() {
    setViewedPages((count) => count + 1);
  }
  return (
    <button type="button" onClick={recordViewedPage}>
      Viewed pages {viewedPages}
    </button>
  );
}
