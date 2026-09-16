import { readFile } from "node:fs/promises";
import { join } from "node:path";

const expectedNodeVersion = (await readFile(join(process.cwd(), ".node-version"), "utf8")).trim();
const actualNodeVersion = process.versions.node;

if (actualNodeVersion !== expectedNodeVersion) {
  throw new Error(
    `Expected Node ${expectedNodeVersion}, but this command is using ${actualNodeVersion}`,
  );
}

process.stdout.write(`Project runtime: Node ${actualNodeVersion}\n`);
