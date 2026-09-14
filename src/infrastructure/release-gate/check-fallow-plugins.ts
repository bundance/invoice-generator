import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { z } from "zod";

import { findMissingRequiredFallowPlugins } from "./fallow-plugins.ts";

const result = spawnSync(
  join(process.cwd(), "node_modules", ".bin", "fallow"),
  ["list", "--format", "json", "--quiet"],
  { encoding: "utf8", timeout: 60_000 },
);
if (result.error) throw result.error;
if (result.signal) throw new Error(`Fallow plugin listing ended with signal ${result.signal}`);
if (result.status !== 0) {
  throw new Error(`Fallow plugin listing failed: ${result.stderr || result.stdout}`);
}

const listing = z
  .object({ plugins: z.array(z.object({ name: z.string() })) })
  .parse(JSON.parse(result.stdout));
const loadedPlugins = listing.plugins.map(({ name }) => name);
const missingPlugins = findMissingRequiredFallowPlugins(loadedPlugins);
if (missingPlugins.length > 0) {
  throw new Error(`Required Fallow plugins are not active: ${missingPlugins.join(", ")}`);
}
process.stdout.write("PASS fallow-plugins (electron, vite)\n");
