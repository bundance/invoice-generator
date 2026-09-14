import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function listDescendantFilePaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const descendantPaths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listDescendantFilePaths(path) : [path];
    }),
  );
  return descendantPaths.flat();
}
