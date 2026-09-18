import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { LiveA4PreviewFrame as PreviewFrame } from "./live-a4-preview-frame.tsx";

const fixedPageWidth = 794;
const fixedPageHeight = 1123;

describe("Live A4 preview frame", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", PreviewResizeObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    activePreviewResize = null;
  });

  it("fits and refits the fixed A4 page to its viewport without exceeding 100 percent", () => {
    const { container } = render(
      <LiveA4PreviewFrame ariaLabel="Invoice preview" documentId="Draft">
        <article data-fit-page>Fixed invoice document</article>
      </LiveA4PreviewFrame>,
    );
    const preview = screen.getByLabelText("Invoice preview");
    const page = container.querySelector<HTMLElement>(".live-a4-preview-page");
    const previewDocument = container.querySelector<HTMLElement>(".live-a4-preview-document");
    const fixedPage = container.querySelector<HTMLElement>("[data-fit-page]");
    if (!page || !previewDocument || !fixedPage) {
      throw new Error("Expected the fitted page and fixed document");
    }
    setFixedPageLayoutSize(fixedPage);

    resizePreview({ height: 600, width: 600 });

    const compactScale = 600 / fixedPageHeight;
    expect(preview).toHaveAttribute("data-preview-mode", "fit");
    expect(Number.parseFloat(page.style.width)).toBeCloseTo(fixedPageWidth * compactScale, 4);
    expect(Number.parseFloat(page.style.height)).toBeCloseTo(600, 4);
    expect(previewDocument.style.transform).toBe(`scale(${compactScale})`);
    expect(Number.parseFloat(page.style.width) / Number.parseFloat(page.style.height)).toBeCloseTo(
      210 / 297,
      3,
    );

    resizePreview({ height: 900, width: 800 });

    const tallScale = 900 / fixedPageHeight;
    expect(tallScale).toBeGreaterThan(0.65);
    expect(Number.parseFloat(page.style.height)).toBeCloseTo(900, 4);
    expect(previewDocument.style.transform).toBe(`scale(${tallScale})`);

    resizePreview({ height: 1600, width: 1000 });

    expect(Number.parseFloat(page.style.width)).toBeCloseTo(fixedPageWidth, 4);
    expect(Number.parseFloat(page.style.height)).toBeCloseTo(fixedPageHeight, 4);
    expect(previewDocument.style.transform).toBe("scale(1)");
  });

  it("fits the fixed A4 page to the available width when width is limiting", () => {
    const { container } = render(
      <LiveA4PreviewFrame ariaLabel="Invoice preview" documentId="Draft">
        <article data-fit-page>Fixed invoice document</article>
      </LiveA4PreviewFrame>,
    );
    const page = container.querySelector<HTMLElement>(".live-a4-preview-page");
    const fixedPage = container.querySelector<HTMLElement>("[data-fit-page]");
    if (!page || !fixedPage) throw new Error("Expected the fitted page and fixed document");
    setFixedPageLayoutSize(fixedPage);

    resizePreview({ height: 900, width: 600 });

    expect(Number.parseFloat(page.style.width)).toBe(600);
    expect(Number.parseFloat(page.style.height)).toBeLessThanOrEqual(900);
    expect(Number.parseFloat(page.style.width) / Number.parseFloat(page.style.height)).toBeCloseTo(
      210 / 297,
      3,
    );
  });

  it("commits a refit before the native resize callback returns", () => {
    const { container } = render(
      <LiveA4PreviewFrame ariaLabel="Invoice preview" documentId="Draft">
        <article data-fit-page>Fixed invoice document</article>
      </LiveA4PreviewFrame>,
    );
    const page = container.querySelector<HTMLElement>(".live-a4-preview-page");
    const fixedPage = container.querySelector<HTMLElement>("[data-fit-page]");
    if (!page || !fixedPage || !activePreviewResize) {
      throw new Error("Expected an observed fitted page");
    }
    setFixedPageLayoutSize(fixedPage);

    activePreviewResize({ height: 600, width: 600 });

    expect(Number.parseFloat(page.style.height)).toBeCloseTo(600, 4);
  });

  it("provides keyboard-operable zoom controls that leave Fit mode", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LiveA4PreviewFrame ariaLabel="Invoice preview" documentId="Draft">
        <article data-fit-page>Fixed invoice document</article>
      </LiveA4PreviewFrame>,
    );
    const preview = screen.getByLabelText("Invoice preview");
    const fixedPage = container.querySelector<HTMLElement>("[data-fit-page]");
    const previewDocument = container.querySelector<HTMLElement>(".live-a4-preview-document");
    if (!fixedPage || !previewDocument) {
      throw new Error("Expected the fixed preview document");
    }
    setFixedPageLayoutSize(fixedPage);
    resizePreview({ height: 600, width: 600 });

    const fit = screen.getByRole("button", { name: "Fit preview" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    expect(fit).toHaveAttribute("aria-pressed", "true");
    expect(zoomOut).toBeEnabled();
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("53%");

    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    await user.tab();
    expect(fit).toHaveFocus();
    await user.tab();
    expect(zoomOut).toHaveFocus();
    await user.tab();
    expect(zoomIn).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(preview).toHaveAttribute("data-preview-mode", "manual");
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("63%");
    expect(previewDocument.style.transform).toBe("scale(0.63)");

    await user.tab({ shift: true });
    expect(zoomOut).toHaveFocus();
    await user.keyboard(" ");

    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("53%");
    expect(previewDocument.style.transform).toBe("scale(0.53)");
  });

  it("keeps manual zoom fixed while resizing and restores responsive Fit", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LiveA4PreviewFrame ariaLabel="Invoice preview" documentId="Draft">
        <article data-fit-page>Fixed invoice document</article>
      </LiveA4PreviewFrame>,
    );
    const fixedPage = container.querySelector<HTMLElement>("[data-fit-page]");
    const page = container.querySelector<HTMLElement>(".live-a4-preview-page");
    const previewDocument = container.querySelector<HTMLElement>(".live-a4-preview-document");
    const viewport = container.querySelector<HTMLElement>(".live-a4-preview-viewport");
    if (!fixedPage || !page || !previewDocument || !viewport) {
      throw new Error("Expected the preview layout");
    }
    setFixedPageLayoutSize(fixedPage);
    resizePreview({ height: 600, width: 600 });
    await user.click(screen.getByRole("button", { name: "Zoom in" }));

    resizePreview({ height: 900, width: 800 });

    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("63%");
    expect(Number.parseFloat(page.style.width)).toBeCloseTo(fixedPageWidth * 0.63, 4);
    expect(previewDocument.style.transform).toBe("scale(0.63)");

    viewport.scrollLeft = 80;
    viewport.scrollTop = 120;
    await user.click(screen.getByRole("button", { name: "Fit preview" }));

    const fitScale = 900 / fixedPageHeight;
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("80%");
    expect(Number.parseFloat(page.style.height)).toBeCloseTo(900, 4);
    expect(previewDocument.style.transform).toBe(`scale(${fitScale})`);
    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);
  });

  it("clamps manual zoom and disables each control at its bound", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LiveA4PreviewFrame ariaLabel="Invoice preview" documentId="Draft">
        <article data-fit-page>Fixed invoice document</article>
      </LiveA4PreviewFrame>,
    );
    const fixedPage = container.querySelector<HTMLElement>("[data-fit-page]");
    if (!fixedPage) throw new Error("Expected the fixed preview document");
    setFixedPageLayoutSize(fixedPage);
    resizePreview({ height: 1600, width: 1000 });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });

    for (let step = 0; step < 10; step += 1) await user.click(zoomIn);

    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("200%");
    expect(zoomIn).toBeDisabled();
    expect(zoomOut).toBeEnabled();

    for (let step = 0; step < 20; step += 1) await user.click(zoomOut);

    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("25%");
    expect(zoomOut).toBeDisabled();
    expect(zoomIn).toBeEnabled();
  });

  it("starts a different document preview in Fit mode", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <LiveA4PreviewFrame ariaLabel="Invoice preview" documentId="Draft">
        <article data-fit-page>Fixed invoice document</article>
      </LiveA4PreviewFrame>,
    );
    const firstFixedPage = container.querySelector<HTMLElement>("[data-fit-page]");
    if (!firstFixedPage) throw new Error("Expected the fixed preview document");
    setFixedPageLayoutSize(firstFixedPage);
    resizePreview({ height: 600, width: 600 });
    await user.click(screen.getByRole("button", { name: "Zoom in" }));

    rerender(
      <LiveA4PreviewFrame ariaLabel="Credit note preview" documentId="CN-GGIOHK-0043">
        <article data-fit-page>Fixed credit-note document</article>
      </LiveA4PreviewFrame>,
    );
    const nextFixedPage = container.querySelector<HTMLElement>("[data-fit-page]");
    if (!nextFixedPage) throw new Error("Expected the next fixed preview document");
    setFixedPageLayoutSize(nextFixedPage);
    resizePreview({ height: 600, width: 600 });

    expect(screen.getByLabelText("Credit note preview")).toHaveAttribute(
      "data-preview-mode",
      "fit",
    );
    expect(screen.getByLabelText("Current zoom")).toHaveTextContent("53%");
  });
});

type TestLiveA4PreviewFrameProps = Readonly<{
  ariaLabel: string;
  children: ReactNode;
  documentId: string;
}>;

const readyFontReadiness = {
  restart() {},
  status: "ready",
} as const;

function LiveA4PreviewFrame({ ariaLabel, children, documentId }: TestLiveA4PreviewFrameProps) {
  return (
    <PreviewFrame ariaLabel={ariaLabel} documentId={documentId} fontReadiness={readyFontReadiness}>
      {children}
    </PreviewFrame>
  );
}

type PreviewSize = Readonly<{ height: number; width: number }>;

function setFixedPageLayoutSize(fixedPage: HTMLElement): void {
  Object.defineProperties(fixedPage, {
    offsetHeight: { configurable: true, value: fixedPageHeight },
    offsetWidth: { configurable: true, value: fixedPageWidth },
  });
}

let activePreviewResize: ((size: PreviewSize) => void) | null = null;

function resizePreview(size: PreviewSize): void {
  if (!activePreviewResize) throw new Error("Expected the preview to observe its viewport");
  activePreviewResize(size);
}

class PreviewResizeObserver implements ResizeObserver {
  readonly #callback: ResizeObserverCallback;
  #target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    activePreviewResize = (size) => this.resize(size);
  }

  disconnect(): void {
    this.#target = null;
  }

  observe(target: Element): void {
    this.#target = target;
  }

  resize({ height, width }: PreviewSize): void {
    if (!this.#target) throw new Error("Expected an observed preview viewport");
    this.#callback([new PreviewResizeObserverEntry({ height, target: this.#target, width })], this);
  }

  unobserve(target: Element): void {
    if (this.#target === target) this.#target = null;
  }
}

class PreviewResizeObserverEntry implements ResizeObserverEntry {
  readonly borderBoxSize: readonly ResizeObserverSize[] = [];
  readonly contentBoxSize: readonly ResizeObserverSize[] = [];
  readonly contentRect: DOMRectReadOnly;
  readonly devicePixelContentBoxSize: readonly ResizeObserverSize[] = [];
  readonly target: Element;

  constructor({ height, target, width }: PreviewResizeObserverEntryOptions) {
    this.contentRect = new DOMRectReadOnly(0, 0, width, height);
    this.target = target;
  }
}

type PreviewResizeObserverEntryOptions = PreviewSize & Readonly<{ target: Element }>;
