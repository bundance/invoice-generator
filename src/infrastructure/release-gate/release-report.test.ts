import { describe, expect, it } from "vite-plus/test";

import type { PackagedReleaseCandidate } from "./package-contract.js";
import { createReleaseReport } from "./release-report.js";
import {
  automatedChecks,
  electronScenarioGroups,
  humanChecks,
  releaseStages,
} from "./release-plan.js";

const candidate = {
  alternatePlatformArtifacts: [],
  appBundleName: "Invoice Generator.app",
  appId: "com.codernetic.invoicegenerator",
  applicationArchitectures: ["arm64"],
  artifactPath: "release/Invoice Generator-0.1.0-arm64.dmg",
  artifactSha256: "b".repeat(64),
  dmgApplicationsLink: true,
  dmgSigned: false,
  forbiddenRuntimeMetadata: [],
  hardenedRuntime: false,
  inspectedApplicationBinaryCount: 13,
  minimumSystemVersion: "26.0",
  nonArm64ApplicationBinaries: [],
  notarized: false,
  productName: "Invoice Generator",
  publishOrUpdateMetadata: [],
  signature: "adhoc",
  unexpectedDmgEntries: [],
} as const satisfies PackagedReleaseCandidate;

describe("exact-artifact release report", () => {
  it("names every passed stage, scenario, automated check, and pending human approval", () => {
    const passedTests = automatedChecks.flatMap(({ evidence, stageId }) =>
      evidence.kind === "tests"
        ? evidence.titleFragments.map((title) => ({ file: "example.test.ts", stageId, title }))
        : [],
    );
    const report = createReleaseReport({
      candidate,
      completedAt: "2026-09-12T22:00:00.000Z",
      passedTests,
      startedAt: "2026-09-12T21:00:00.000Z",
    });

    expect(report.status).toBe("awaiting-human-approval");
    expect(report.artifact).toEqual({
      path: candidate.artifactPath,
      sha256: candidate.artifactSha256,
    });
    expect(report.stages).toEqual(
      releaseStages.map(({ id, name }) => ({ id, name, status: "passed" })),
    );
    expect(report.electronScenarios).toEqual(
      electronScenarioGroups.map(({ evidence, id, name, stageId }) => ({
        evidenceKind: evidence.kind,
        evidenceTests:
          evidence.kind === "tests"
            ? evidence.titleFragments.map((title) => ({
                file: "example.test.ts",
                stageId,
                title,
              }))
            : [],
        id,
        name,
        status: "passed",
      })),
    );
    expect(report.automatedChecks).toEqual(
      automatedChecks.map(({ evidence, id, name, stageId }) => ({
        evidenceKind: evidence.kind,
        evidenceTests:
          evidence.kind === "tests"
            ? evidence.titleFragments.map((title) => ({
                file: "example.test.ts",
                stageId,
                title,
              }))
            : [],
        id,
        name,
        status: "passed",
      })),
    );
    expect(report.humanApprovals).toEqual(
      humanChecks.map(({ id, name }) => ({
        artifactSha256: candidate.artifactSha256,
        id,
        name,
        status: "pending",
      })),
    );
    expect(report.testEvidence).toEqual(passedTests);
  });

  it("refuses to report a named check without passing test evidence", () => {
    expect(() =>
      createReleaseReport({
        candidate,
        completedAt: "2026-09-12T22:00:00.000Z",
        passedTests: [],
        startedAt: "2026-09-12T21:00:00.000Z",
      }),
    ).toThrow("has no passing electron test");
  });

  it("refuses test evidence from a different release stage", () => {
    const passedTests = automatedChecks.flatMap(({ evidence, stageId }) =>
      evidence.kind === "tests"
        ? evidence.titleFragments.map((title) => ({
            file: "example.test.ts",
            stageId: stageId === "electron" ? "pdf" : stageId,
            title,
          }))
        : [],
    );

    expect(() =>
      createReleaseReport({
        candidate,
        completedAt: "2026-09-12T22:00:00.000Z",
        passedTests,
        startedAt: "2026-09-12T21:00:00.000Z",
      }),
    ).toThrow("has no passing electron test");
  });
});
