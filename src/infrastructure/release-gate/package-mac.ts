import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const releaseDirectory = join(process.cwd(), "release");
await rm(releaseDirectory, { force: true, recursive: true });

const result = spawnSync("electron-builder", ["--mac", "dmg", "--arm64"], {
  stdio: "inherit",
  timeout: 240_000,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`arm64 DMG packaging ended with signal ${result.signal}`);
if (result.status !== 0) {
  throw new Error(`arm64 DMG packaging failed with status ${result.status ?? "unknown"}`);
}
