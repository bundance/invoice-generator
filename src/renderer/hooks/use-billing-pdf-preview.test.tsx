import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { PdfPreviewResult } from "../../application/invoice-application-contract.ts";
import { persistedInvoiceDraftSchema } from "../../domain/invoices/invoice-draft.ts";
import { completeInvoiceDraftInput } from "../../../tests/fixtures/issued-invoice.ts";
import { deferred, testInvoiceAppCommands } from "../app/app-test-support.ts";
import { useBillingPdfPreview, type BillingPdfPreviewRequest } from "./use-billing-pdf-preview.ts";

describe("generated billing PDF preview", () => {
  afterEach(cleanup);

  it("ignores an older PDF response after the draft changes", async () => {
    const firstPreview = deferred<PdfPreviewResult>();
    const secondPreview = deferred<PdfPreviewResult>();
    const firstDraft = persistedInvoiceDraftSchema.parse({
      ...completeInvoiceDraftInput,
      notes: "First draft",
    });
    const secondDraft = persistedInvoiceDraftSchema.parse({
      ...completeInvoiceDraftInput,
      notes: "Second draft",
    });
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      previewInvoiceDraft: (input) =>
        input.notes === "First draft" ? firstPreview.promise : secondPreview.promise,
    };
    const firstRequest = { input: firstDraft, kind: "invoice" } as const;
    const secondRequest = { input: secondDraft, kind: "invoice" } as const;
    const { result, rerender } = renderHook(
      ({
        request,
        requestKey,
      }: Readonly<{
        request: BillingPdfPreviewRequest;
        requestKey: string;
      }>) => useBillingPdfPreview(request, requestKey),
      { initialProps: { request: firstRequest, requestKey: "first" } },
    );

    await waitFor(() => expect(result.current.state.kind).toBe("loading"));
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    rerender({ request: secondRequest, requestKey: "second" });
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    secondPreview.resolve(readyPreview("Second"));
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: "ready" }));
    firstPreview.resolve(readyPreview("First"));
    await act(() => Promise.resolve());

    expect(result.current.state).toMatchObject({
      kind: "ready",
      preview: { documentId: "Second" },
    });
  });

  it("returns to loading and retries after preview generation fails", async () => {
    let attempt = 0;
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      previewInvoiceDraft: () => {
        attempt += 1;
        return Promise.resolve(
          attempt === 1
            ? { kind: "failed", message: "PDF generation failed." }
            : readyPreview("Retried"),
        );
      },
    };
    const draft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const { result } = renderHook(() =>
      useBillingPdfPreview({ input: draft, kind: "invoice" }, "draft"),
    );

    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: "failed",
        message: "PDF generation failed.",
      }),
    );
    act(() => result.current.retry());
    expect(result.current.state).toEqual({ kind: "loading" });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        kind: "ready",
        preview: { documentId: "Retried" },
      }),
    );
  });
});

function readyPreview(documentId: string): Extract<PdfPreviewResult, { kind: "ready" }> {
  return {
    kind: "ready",
    preview: { bytes: new Uint8Array([37, 80, 68, 70]), documentId, pageCount: 1 },
  };
}
