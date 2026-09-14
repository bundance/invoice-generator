import type { DatasetArchive } from "./workspace.js";

export const unusedDatasetArchive = {
  cancelRestore: () => undefined,
  commitRestore: () => Promise.reject(new Error("Restore is not used in this test")),
  createBackup: () => Promise.reject(new Error("Backup is not used in this test")),
  inspectRestore: () => Promise.reject(new Error("Restore is not used in this test")),
} satisfies DatasetArchive;
