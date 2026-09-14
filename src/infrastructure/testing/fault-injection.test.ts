import { describe, expect, it } from "vite-plus/test";

import { createFaultInjectorFromJson } from "./fault-injection.js";

describe("fault injection", () => {
  it("validates an ordered JSON plan and consumes each matching fault once", () => {
    const faultInjector = createFaultInjectorFromJson('["pdf-generation","document-open"]');

    expect(() => faultInjector.throwIfPlanned("pdf-verification")).not.toThrow();
    expect(() => faultInjector.throwIfPlanned("pdf-generation")).toThrow(
      "Injected failure at pdf-generation",
    );
    expect(() => faultInjector.throwIfPlanned("pdf-generation")).not.toThrow();
    expect(() => faultInjector.throwIfPlanned("document-open")).toThrow(
      "Injected failure at document-open",
    );
  });

  it.each(["not JSON", '["unknown-fault"]', "{}"])(
    "rejects an invalid fault plan: %s",
    (planJson) => {
      expect(() => createFaultInjectorFromJson(planJson)).toThrow("The test fault plan is invalid");
    },
  );
});
