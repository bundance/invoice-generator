import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { packagedReleaseCandidateSchema } from "./package-contract.ts";
import { createReleaseReport } from "./release-report.ts";
import { releaseStages } from "./release-plan.ts";

const startedAt = new Date().toISOString();
const testResultsDirectory = join(process.cwd(), "test-results");
const passedTests: PassedTest[] = [];
await rm(testResultsDirectory, { force: true, recursive: true });
await mkdir(testResultsDirectory, { recursive: true });

for (const stage of releaseStages) {
  process.stdout.write(`\nSTART ${stage.id}: ${stage.name}\n`);
  const result = spawnSync(stage.command, {
    env: process.env,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${stage.name} failed with status ${result.status ?? "unknown"}${result.signal ? ` (${result.signal})` : ""}`,
    );
  }
  process.stdout.write(`PASS ${stage.id}: ${stage.name}\n`);

  if ("result" in stage) {
    const report = JSON.parse(await readFile(join(process.cwd(), stage.result.path), "utf8"));
    passedTests.push(
      ...(stage.result.kind === "vitest"
        ? readAcceptedVitestResults({ reportInput: report, stageId: stage.id })
        : readAcceptedPlaywrightResults({ reportInput: report, stageId: stage.id })),
    );
    process.stdout.write(`PASS ${stage.id}: accepted machine-readable test results\n`);
  }

  if (stage.id === "electron" || stage.id === "pdf") {
    await rm(testResultsDirectory, { force: true, recursive: true });
    if (stage.id === "electron") await mkdir(testResultsDirectory, { recursive: true });
  }
}

const releaseDirectory = join(process.cwd(), "release");
const candidate = packagedReleaseCandidateSchema.parse(
  JSON.parse(await readFile(join(releaseDirectory, "release-candidate.json"), "utf8")),
);
const currentArtifactSha256 = createHash("sha256")
  .update(await readFile(join(process.cwd(), candidate.artifactPath)))
  .digest("hex");
if (currentArtifactSha256 !== candidate.artifactSha256) {
  throw new Error("The inspected DMG changed before the final acceptance report was written");
}

const report = createReleaseReport({
  candidate,
  completedAt: new Date().toISOString(),
  passedTests,
  startedAt,
});
const reportPath = join(releaseDirectory, "acceptance-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write("\nLOCAL RELEASE GATE PASSED\n");
process.stdout.write(`Artifact SHA-256: ${candidate.artifactSha256}\n`);
process.stdout.write(`Report: ${reportPath}\n`);
process.stdout.write("Human approvals: pending for this exact artifact\n");
import {
  readAcceptedPlaywrightResults,
  readAcceptedVitestResults,
  type PassedTest,
} from "./accepted-test-results.ts";
