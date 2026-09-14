import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { listDescendantFilePaths } from "./file-tree.ts";

const outputDirectory = await mkdtemp(join(tmpdir(), "invoice-generator-evidence-probe-"));

try {
  const result = spawnSync(
    join(process.cwd(), "node_modules", ".bin", "playwright"),
    ["test", "--config=playwright.evidence.config.ts"],
    {
      encoding: "utf8",
      env: { ...process.env, INVOICE_GENERATOR_EVIDENCE_PROBE_OUTPUT: outputDirectory },
      timeout: 120_000,
    },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Evidence probe ended with signal ${result.signal}`);
  if (result.status === 0) throw new Error("The intentionally failing evidence probe passed");

  const retainedPaths = await listDescendantFilePaths(outputDirectory);
  const retainedNames = retainedPaths.map((path) => basename(path));
  requireRetainedName(retainedNames, "trace.zip");
  requireRetainedName(retainedNames, "failure-manifest.json");
  requireRetainedName(retainedNames, "probe-marker.txt");
  requireRetainedName(retainedNames, "network-requests.log");
  if (!retainedNames.some((name) => name.endsWith(".png"))) {
    throw new Error("The failed Electron journey did not retain a screenshot");
  }

  await Promise.all(
    ["main-process.stdout.log", "main-process.stderr.log", "renderer.log"].map(
      async (requiredLog) => {
        const logPath = retainedPaths.find((path) => basename(path) === requiredLog);
        if (!logPath) throw new Error(`${requiredLog} was not retained`);
        if ((await readFile(logPath, "utf8")).trim().length === 0) {
          throw new Error(`${requiredLog} was retained without diagnostic output`);
        }
      },
    ),
  );

  process.stdout.write("PASS electron-failure-evidence\n");
} finally {
  await rm(outputDirectory, { force: true, recursive: true });
}

function requireRetainedName(retainedNames: readonly string[], requiredName: string): void {
  if (!retainedNames.includes(requiredName)) {
    throw new Error(`The failed Electron journey did not retain ${requiredName}`);
  }
}
