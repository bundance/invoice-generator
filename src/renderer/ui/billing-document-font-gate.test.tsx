import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  billingDocumentFontFaceCount,
  billingDocumentFonts,
} from "../../documents/billing-document-fonts.ts";
import {
  createLoadedTestDocumentFonts as createLoadedDocumentFonts,
  createTestDocumentFonts as createDocumentFonts,
  setTestDocumentFonts as setDocumentFonts,
} from "../../../tests/fixtures/test-document-fonts.ts";
import { deferred } from "../app/app-test-support.ts";
import { BillingDocumentFontGate } from "./billing-document-font-gate.tsx";
import { LiveA4PreviewFrame as PreviewFrame } from "./live-a4-preview-frame.tsx";

describe("Billing document font gate", () => {
  beforeEach(() => {
    setDocumentFonts(createLoadedDocumentFonts());
  });

  afterEach(cleanup);

  it("keeps the document covered and busy until every bundled Arimo face loads", async () => {
    const fontLoad = deferred<void>();
    const fonts = createDocumentFonts({
      load: async (face) => {
        await fontLoad.promise;
        face.status = "loaded";
      },
      status: "unloaded",
    });
    setDocumentFonts(fonts);
    const onReadyChange = vi.fn<(isReady: boolean) => void>();

    render(
      <TestPreview ariaLabel="Invoice preview" onReadyChange={onReadyChange}>
        <article data-fit-page>Fixed invoice document</article>
      </TestPreview>,
    );

    expect(screen.getByLabelText("Invoice preview")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Preparing document fonts…")).toBeVisible();
    expect(screen.getByText("Fixed invoice document").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(onReadyChange).toHaveBeenLastCalledWith(false);

    fontLoad.resolve();

    await waitFor(() =>
      expect(screen.getByLabelText("Invoice preview")).not.toHaveAttribute("aria-busy"),
    );
    expect(screen.queryByText("Preparing document fonts…")).not.toBeInTheDocument();
    expect(screen.getByText("Fixed invoice document").parentElement).not.toHaveAttribute(
      "aria-hidden",
    );
    expect(onReadyChange).toHaveBeenLastCalledWith(true);
    expect(fonts.faces).toHaveLength(billingDocumentFontFaceCount);
    expect(fonts.faces.every(({ status }) => status === "loaded")).toBe(true);
  });

  it("reports a persistent failure when one expected face is missing", async () => {
    const fonts = createLoadedDocumentFonts();
    fonts.faces.pop();
    setDocumentFonts(fonts);

    render(
      <TestPreview ariaLabel="Invoice preview">
        <article data-fit-page>Fixed invoice document</article>
      </TestPreview>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The document fonts could not be prepared.",
    );
    expect(screen.getByRole("button", { name: "Retry document fonts" })).toBeVisible();
    expect(screen.getByText("Fixed invoice document").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("rejects an errored expected face even after the font set reports ready", async () => {
    const fonts = createLoadedDocumentFonts();
    const failedFace = fonts.faces[0];
    if (!failedFace) throw new Error("Expected an Arimo test face");
    failedFace.status = "error";
    failedFace.load = () => Promise.reject(new Error("Font load failed"));
    setDocumentFonts(fonts);

    render(
      <TestPreview ariaLabel="Invoice preview">
        <article data-fit-page>Fixed invoice document</article>
      </TestPreview>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The document fonts could not be prepared.",
    );
    expect(screen.getByLabelText("Invoice preview")).toHaveAttribute("aria-busy", "true");
  });

  it("accepts Chromium-normalized Unicode ranges for every expected face", async () => {
    const fonts = createLoadedDocumentFonts();
    for (const face of fonts.faces) {
      face.unicodeRange = face.unicodeRange.replaceAll(
        /U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gu,
        (_range, start: string, end: string | undefined) =>
          `U+${Number.parseInt(start, 16).toString(16).toUpperCase()}${
            end ? `-${Number.parseInt(end, 16).toString(16).toUpperCase()}` : ""
          }`,
      );
    }
    setDocumentFonts(fonts);

    render(
      <TestPreview ariaLabel="Invoice preview">
        <article data-fit-page>Fixed invoice document</article>
      </TestPreview>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Invoice preview")).toHaveAttribute("data-font-status", "ready"),
    );
  });

  it("retries a failed load without remounting the document", async () => {
    const failedFonts = createDocumentFonts({
      load: (face) => {
        if (face === failedFonts.faces[0]) {
          face.status = "error";
          return Promise.reject(new Error("Font load failed"));
        }
        face.status = "loaded";
        return Promise.resolve();
      },
      status: "unloaded",
    });
    setDocumentFonts(failedFonts);
    const user = userEvent.setup();

    const { container } = render(
      <TestPreview ariaLabel="Invoice preview">
        <article data-fit-page>
          <input aria-label="Draft note" defaultValue="Keep this work" />
        </article>
      </TestPreview>,
    );
    const draftNote = screen.getByLabelText("Draft note");
    expect(await screen.findByRole("alert")).toBeVisible();
    const failedFontStyle = container.querySelector("style[data-billing-document-fonts]");
    if (!failedFontStyle) throw new Error("Expected the preview font registration");

    setDocumentFonts(createLoadedDocumentFonts());
    await user.click(screen.getByRole("button", { name: "Retry document fonts" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Invoice preview")).not.toHaveAttribute("aria-busy"),
    );
    expect(container.querySelector("style[data-billing-document-fonts]")).not.toBe(failedFontStyle);
    expect(failedFonts.faces[0]).toHaveProperty("status", "error");
    expect(screen.getByLabelText("Draft note")).toBe(draftNote);
    expect(screen.getByLabelText("Draft note")).toHaveValue("Keep this work");
  });

  it("ignores an older font load after a newer attempt succeeds", async () => {
    const oldLoad = deferred<void>();
    const oldFonts = createDocumentFonts({
      load: async (face) => {
        await oldLoad.promise;
        face.status = "loaded";
      },
      status: "unloaded",
    });
    setDocumentFonts(oldFonts);
    const onReadyChange = vi.fn<(isReady: boolean) => void>();
    const user = userEvent.setup();
    render(
      <TestPreview ariaLabel="Invoice preview" onReadyChange={onReadyChange} showRestart>
        <article data-fit-page>Fixed invoice document</article>
      </TestPreview>,
    );

    setDocumentFonts(createLoadedDocumentFonts());
    await user.click(screen.getByRole("button", { name: "Restart test font load" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Invoice preview")).toHaveAttribute("data-font-status", "ready"),
    );

    oldLoad.resolve();

    await waitFor(() =>
      expect(oldFonts.faces.every(({ status }) => status === "loaded")).toBe(true),
    );
    expect(screen.getByLabelText("Invoice preview")).toHaveAttribute("data-font-status", "ready");
    expect(onReadyChange).toHaveBeenLastCalledWith(true);
  });

  it("does not publish readiness after the preview unmounts", async () => {
    const fontLoad = deferred<void>();
    const fonts = createDocumentFonts({
      load: async (face) => {
        await fontLoad.promise;
        face.status = "loaded";
      },
      status: "unloaded",
    });
    setDocumentFonts(fonts);
    const onReadyChange = vi.fn<(isReady: boolean) => void>();
    const { unmount } = render(
      <TestPreview ariaLabel="Invoice preview" onReadyChange={onReadyChange}>
        <article data-fit-page>Fixed invoice document</article>
      </TestPreview>,
    );

    unmount();
    fontLoad.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onReadyChange).not.toHaveBeenCalledWith(true);
  });
});

type TestPreviewProps = Readonly<{
  ariaLabel: string;
  children: ReactNode;
  onReadyChange?: (isReady: boolean) => void;
  showRestart?: boolean;
}>;

function TestPreview({
  ariaLabel,
  children,
  onReadyChange,
  showRestart = false,
}: TestPreviewProps) {
  return (
    <BillingDocumentFontGate fonts={billingDocumentFonts}>
      {(fontReadiness) => {
        onReadyChange?.(fontReadiness.status === "ready");
        return (
          <>
            {showRestart ? (
              <button onClick={fontReadiness.restart} type="button">
                Restart test font load
              </button>
            ) : null}
            <PreviewFrame ariaLabel={ariaLabel} documentId="Draft" fontReadiness={fontReadiness}>
              {children}
            </PreviewFrame>
          </>
        );
      }}
    </BillingDocumentFontGate>
  );
}
