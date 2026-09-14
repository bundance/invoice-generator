import { describe, expect, it } from "vite-plus/test";

import { checkAcceptedTestPolicy } from "./test-policy.js";

describe("accepted release test policy", () => {
  it("accepts runnable tests with zero configured retries", () => {
    expect(
      checkAcceptedTestPolicy({
        playwrightRetries: 0,
        testSources: [{ path: "example.test.ts", source: 'test("works", () => undefined);' }],
      }),
    ).toEqual([]);
  });

  it.each([
    ["skipped", 'test.skip("not now", () => undefined);'],
    ["pending", 'it.todo("later");'],
    ["quarantined", 'test.quarantine("flaky", () => undefined);'],
    ["focused", 'describe.only("just this", () => undefined);'],
  ])("rejects %s test declarations", (expectedProblem, source) => {
    expect(
      checkAcceptedTestPolicy({
        playwrightRetries: 0,
        testSources: [{ path: "example.test.ts", source }],
      }),
    ).toEqual([expect.stringContaining(expectedProblem)]);
  });

  it("rejects configured retries", () => {
    expect(
      checkAcceptedTestPolicy({
        playwrightRetries: 1,
        testSources: [],
      }),
    ).toEqual([expect.stringContaining("retried")]);
  });

  it("rejects a per-suite retry override", () => {
    expect(
      checkAcceptedTestPolicy({
        playwrightRetries: 0,
        testSources: [
          {
            path: "example.spec.ts",
            source: "test.describe.configure({ retries: 1 });",
          },
        ],
      }),
    ).toEqual([expect.stringContaining("retried")]);
  });
});
