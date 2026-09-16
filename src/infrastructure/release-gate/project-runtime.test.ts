import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const runtimeCheckPath = join(
  repositoryRoot,
  "src/infrastructure/release-gate/check-project-runtime.ts",
);

describe("project Node runtime", () => {
  it("runs tests with the version pinned by .node-version", async () => {
    const pinnedVersion = (await readFile(join(repositoryRoot, ".node-version"), "utf8")).trim();

    expect(process.versions.node).toBe(pinnedVersion);
  });

  it("rejects a process that does not match the project pin", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "invoice-generator-runtime-"));
    const mismatchedVersion = "0.0.0";

    try {
      await writeFile(join(fixtureRoot, ".node-version"), `${mismatchedVersion}\n`);
      const result = spawnSync(
        process.execPath,
        ["--experimental-strip-types", "--no-warnings", runtimeCheckPath],
        { cwd: fixtureRoot, encoding: "utf8" },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        `Expected Node ${mismatchedVersion}, but this command is using ${process.versions.node}`,
      );
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });
});
