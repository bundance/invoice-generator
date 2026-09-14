import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { acceptedTestRetries } from "../../../playwright.config.ts";
import { listDescendantFilePaths } from "./file-tree.ts";
import { checkAcceptedTestPolicy } from "./test-policy.ts";

const testSources = await Promise.all(
  (await findTestPaths(process.cwd())).map(async (path) => ({
    path,
    source: await readFile(path, "utf8"),
  })),
);
const problems = checkAcceptedTestPolicy({
  playwrightRetries: acceptedTestRetries,
  testSources,
});

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  throw new Error("The accepted release test policy is not satisfied");
}

process.stdout.write(
  `PASS test-policy (${testSources.length} runnable test files, zero retries)\n`,
);

async function findTestPaths(root: string): Promise<string[]> {
  const paths = await Promise.all(
    [join(root, "src"), join(root, "tests")].map((directory) => findTestsIn(directory)),
  );
  return paths.flat().sort();
}

async function findTestsIn(directory: string): Promise<string[]> {
  return (await listDescendantFilePaths(directory)).filter((path) =>
    /\.(?:spec|test)\.tsx?$/u.test(path),
  );
}
