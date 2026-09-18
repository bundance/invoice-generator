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
