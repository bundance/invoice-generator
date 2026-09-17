import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { LiveA4PreviewFrame } from "./live-a4-preview-frame.tsx";

const a4WidthPixels = (210 / 25.4) * 96;
const a4HeightPixels = (297 / 25.4) * 96;

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
        <article>Fixed invoice document</article>
      </LiveA4PreviewFrame>,
    );
    const preview = screen.getByLabelText("Invoice preview");
    const page = container.querySelector<HTMLElement>(".live-a4-preview-page");
    const document = container.querySelector<HTMLElement>(".live-a4-preview-document");
    if (!page || !document) throw new Error("Expected the fitted page and fixed document");

    resizePreview({ height: 600, width: 600 });

    const compactScale = 600 / a4HeightPixels;
    expect(preview).toHaveAttribute("data-preview-mode", "fit");
    expect(Number.parseFloat(page.style.width)).toBeCloseTo(a4WidthPixels * compactScale, 4);
    expect(Number.parseFloat(page.style.height)).toBeCloseTo(600, 4);
    expect(document.style.transform).toBe(`scale(${compactScale})`);
    expect(Number.parseFloat(page.style.width) / Number.parseFloat(page.style.height)).toBeCloseTo(
      210 / 297,
      5,
    );

    resizePreview({ height: 900, width: 800 });

    const tallScale = 900 / a4HeightPixels;
    expect(tallScale).toBeGreaterThan(0.65);
    expect(Number.parseFloat(page.style.height)).toBeCloseTo(900, 4);
    expect(document.style.transform).toBe(`scale(${tallScale})`);

    resizePreview({ height: 1600, width: 1000 });

    expect(Number.parseFloat(page.style.width)).toBeCloseTo(a4WidthPixels, 4);
    expect(Number.parseFloat(page.style.height)).toBeCloseTo(a4HeightPixels, 4);
    expect(document.style.transform).toBe("scale(1)");
  });
});

type PreviewSize = Readonly<{ height: number; width: number }>;

let activePreviewResize: ((size: PreviewSize) => void) | null = null;

function resizePreview(size: PreviewSize): void {
  if (!activePreviewResize) throw new Error("Expected the preview to observe its viewport");
  act(() => activePreviewResize?.(size));
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
