import { describe, expect, it } from "vite-plus/test";

import { decideEvidenceRetention } from "./evidence-policy.js";

describe("Electron journey evidence policy", () => {
  it("removes temporary evidence after a clean pass", () => {
    expect(
      decideEvidenceRetention({
        attemptedNetworkRequests: [],
        testStatus: "passed",
      }),
    ).toEqual({ kind: "remove" });
  });

  it.each(["failed", "timedOut", "interrupted"] as const)(
    "retains diagnostic evidence when a journey is %s",
    (testStatus) => {
      expect(decideEvidenceRetention({ attemptedNetworkRequests: [], testStatus })).toEqual({
        kind: "retain",
        problems: [`Electron journey ended with status ${testStatus}`],
      });
    },
  );

  it("fails and retains the journey when any network request is attempted", () => {
    expect(
      decideEvidenceRetention({
        attemptedNetworkRequests: ["https://example.com/data"],
        testStatus: "passed",
      }),
    ).toEqual({
      kind: "retain",
      problems: ["Electron journey attempted a network request: https://example.com/data"],
    });
  });
});
