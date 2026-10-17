import { describe, expect, it } from "vite-plus/test";

import { transition, type PreviewAttempt } from "./billing-pdf-preview-state.ts";

const preview = { bytes: new Uint8Array([37, 80, 68, 70]), documentId: "Invoice" };
const renderingAttempt: PreviewAttempt = {
  generation: 3,
  requestKey: "First request",
  state: { kind: "rendering", preview },
};

describe("billing PDF preview transitions", () => {
  it("keeps the same attempt when the request has not changed", () => {
    expect(
      transition(renderingAttempt, {
        kind: "request-changed",
        requestKey: renderingAttempt.requestKey,
      }),
    ).toBe(renderingAttempt);
  });

  it.each(["Second request", null])("starts a fresh generation for request %s", (requestKey) => {
    expect(transition(renderingAttempt, { kind: "request-changed", requestKey })).toEqual({
      generation: 4,
      requestKey,
      state: { kind: "loading" },
    });
  });

  it("retries the same request with a fresh generation", () => {
    expect(transition(renderingAttempt, { kind: "retry" })).toEqual({
      generation: 4,
      requestKey: renderingAttempt.requestKey,
      state: { kind: "loading" },
    });
  });

  it("does not retry a cancelled request", () => {
    const cancelled = transition(renderingAttempt, { kind: "request-changed", requestKey: null });
    expect(transition(cancelled, { kind: "retry" })).toBe(cancelled);
    expect(transition(cancelled, { kind: "request-changed", requestKey: null })).toBe(cancelled);
  });

  it("ignores generation and display results from an older attempt", () => {
    const retried = transition(renderingAttempt, { kind: "retry" });
    expect(
      transition(retried, { kind: "loaded", generation: 3, state: renderingAttempt.state }),
    ).toBe(retried);
    expect(transition(retried, { kind: "displayed", generation: 3 })).toBe(retried);
    expect(
      transition(retried, { kind: "display-failed", generation: 3, message: "Obsolete failure" }),
    ).toBe(retried);
  });

  it("accepts generation success and failure for the current attempt", () => {
    const loading = transition(renderingAttempt, { kind: "retry" });
    expect(
      transition(loading, { kind: "loaded", generation: 4, state: renderingAttempt.state }),
    ).toEqual({ ...loading, state: renderingAttempt.state });
    const failure = { kind: "failed", message: "Generation failed" } as const;
    expect(transition(loading, { kind: "loaded", generation: 4, state: failure })).toEqual({
      ...loading,
      state: failure,
    });
  });

  it("marks a rendered preview displayed and preserves its PDF", () => {
    const displayed = transition(renderingAttempt, { kind: "displayed", generation: 3 });
    expect(displayed).toEqual({ ...renderingAttempt, state: { kind: "displayed", preview } });
    expect(transition(displayed, { kind: "displayed", generation: 3 })).toBe(displayed);
  });

  it("accepts a display failure before and after the PDF is displayed", () => {
    const displayed = transition(renderingAttempt, { kind: "displayed", generation: 3 });
    const event = { kind: "display-failed", generation: 3, message: "Canvas failed" } as const;
    const expected = { ...renderingAttempt, state: { kind: "failed", message: "Canvas failed" } };
    expect(transition(renderingAttempt, event)).toEqual(expected);
    expect(transition(displayed, event)).toEqual(expected);
  });

  it("ignores display callbacks while loading or after failure", () => {
    const loading = transition(renderingAttempt, { kind: "retry" });
    const failed = transition(renderingAttempt, {
      kind: "display-failed",
      generation: 3,
      message: "First failure",
    });
    expect(transition(loading, { kind: "displayed", generation: 4 })).toBe(loading);
    expect(
      transition(loading, { kind: "display-failed", generation: 4, message: "Premature failure" }),
    ).toBe(loading);
    expect(transition(failed, { kind: "displayed", generation: 3 })).toBe(failed);
    expect(
      transition(failed, { kind: "display-failed", generation: 3, message: "Later failure" }),
    ).toBe(failed);
  });
});
