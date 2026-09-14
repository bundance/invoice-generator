import { describe, expect, it } from "vite-plus/test";

import {
  readAcceptedPlaywrightResults,
  readAcceptedVitestResults,
} from "./accepted-test-results.js";

describe("accepted release test results", () => {
  it("accepts only fully passed Vitest results", () => {
    expect(
      readAcceptedVitestResults({
        reportInput: {
          numFailedTests: 0,
          numPendingTests: 0,
          numPendingTestSuites: 0,
          numTodoTests: 0,
          success: true,
          testResults: [
            {
              assertionResults: [{ fullName: "domain example passes", status: "passed" }],
              name: "/repo/src/domain/example.test.ts",
            },
          ],
        },
        stageId: "domain-persistence",
      }),
    ).toEqual([
      {
        file: "/repo/src/domain/example.test.ts",
        stageId: "domain-persistence",
        title: "domain example passes",
      },
    ]);
    expect(() =>
      readAcceptedVitestResults({
        reportInput: {
          numFailedTests: 0,
          numPendingTests: 1,
          numPendingTestSuites: 0,
          numTodoTests: 0,
          success: true,
          testResults: [],
        },
        stageId: "domain-persistence",
      }),
    ).toThrow("pending");
  });

  it("rejects skipped, unexpected, flaky, or retried Playwright results", () => {
    const acceptedReport = {
      stats: { expected: 1, flaky: 0, skipped: 0, unexpected: 0 },
      suites: [
        {
          specs: [
            {
              file: "tests/e2e/example.spec.ts",
              tests: [{ results: [{ retry: 0, status: "passed" }], status: "expected" }],
              title: "Electron example passes",
            },
          ],
        },
      ],
    };
    expect(
      readAcceptedPlaywrightResults({ reportInput: acceptedReport, stageId: "electron" }),
    ).toEqual([
      {
        file: "tests/e2e/example.spec.ts",
        stageId: "electron",
        title: "Electron example passes",
      },
    ]);
    expect(() =>
      readAcceptedPlaywrightResults({
        reportInput: {
          ...acceptedReport,
          stats: { ...acceptedReport.stats, flaky: 1 },
        },
        stageId: "electron",
      }),
    ).toThrow("flaky");
  });
});
