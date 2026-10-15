/// <reference lib="dom" />

import "@testing-library/jest-dom/vitest";

class TestResizeObserver implements ResizeObserver {
  disconnect(): void {}

  observe(): void {}

  unobserve(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: TestResizeObserver,
});

if ("HTMLElement" in globalThis) {
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement): DOMRect {
      // JSDOM places every element at (0, 0); keep resize hit targets away from simulated form clicks.
      if (this.hasAttribute("data-separator")) return new DOMRect(600, 100, 24, 800);
      return Element.prototype.getBoundingClientRect.call(this);
    },
  });

  Object.defineProperties(HTMLDialogElement.prototype, {
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
  });
}
