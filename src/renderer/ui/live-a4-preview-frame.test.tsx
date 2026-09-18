import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { LiveA4PreviewFrame } from "./live-a4-preview-frame.tsx";

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
});

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
