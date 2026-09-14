import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ElectronApplication } from "playwright";

import {
  closeApp,
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "./support/electron-test-app.js";

test("malformed state stays blocked until a validated whole-dataset replacement commits", async () => {
  const sourceDataPath = await createUserDataPath("recovery-source");
  const targetDataPath = await createUserDataPath("recovery-target");
  const outputPath = await createUserDataPath("recovery-output");
  const backupPath = join(outputPath, "validated.zip");
  const invalidBackupPath = join(outputPath, "invalid.zip");
  const originalState = "not valid JSON";
  const retainedDirectory = join(targetDataPath, "retained-pdfs");
  const retainedFilePath = join(retainedDirectory, "keep-during-recovery.pdf");
  await mkdir(retainedDirectory);
  await Promise.all([
    writeFile(join(targetDataPath, "state.json"), originalState),
    writeFile(retainedFilePath, "original retained data"),
    writeFile(invalidBackupPath, "not a ZIP archive"),
  ]);
  const sourceApp = await launchProductionApp(sourceDataPath);
  let targetApp: ElectronApplication | null = null;

  try {
    const sourcePage = await sourceApp.firstWindow();
    await sourceApp.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
    }, backupPath);
    await sourcePage.getByRole("button", { name: "Settings" }).click();
    await sourcePage.getByRole("button", { name: "Create backup" }).click();
    await expect(sourcePage.getByText("Complete backup created and validated.")).toBeVisible();
    const replacementState = await readFile(join(sourceDataPath, "state.json"), "utf8");
    await closeApp(sourceApp);

    targetApp = await launchProductionApp(targetDataPath, ["restored-state-commit"]);
    const targetPage = await targetApp.firstWindow();
    await expect(targetPage.getByRole("heading", { name: "Recovery required" })).toBeVisible();
    await expect(targetPage.getByText("Malformed state")).toBeVisible();
    await expect(targetPage.getByRole("navigation")).toHaveCount(0);
    await expect(targetPage.getByRole("button")).toHaveCount(2);

    await selectRestorePath(targetApp, null);
    await targetPage.getByRole("button", { name: "Select validated backup" }).click();
    await expect(
      targetPage.getByText("No backup was selected. Recovery is still required."),
    ).toBeVisible();
    await expectOriginalData(targetDataPath, retainedFilePath, originalState);

    await selectRestorePath(targetApp, invalidBackupPath);
    await targetPage.getByRole("button", { name: "Select validated backup" }).click();
    await expect(targetPage.getByText(/selected backup is invalid or incomplete/i)).toBeVisible();
    await expectOriginalData(targetDataPath, retainedFilePath, originalState);

    await selectRestorePath(targetApp, backupPath);
    await targetPage.getByRole("button", { name: "Select validated backup" }).click();
    await expect(targetPage.getByText(/recovery is still required/i)).toBeVisible();
    await expectOriginalData(targetDataPath, retainedFilePath, originalState);

    await targetPage.getByRole("button", { name: "Select validated backup" }).click();
    await expect(
      targetPage.getByRole("heading", { level: 1, name: "Create invoice" }),
    ).toBeVisible();
    await expect(readFile(join(targetDataPath, "state.json"), "utf8")).resolves.toBe(
      replacementState,
    );
  } finally {
    await Promise.allSettled([closeApp(sourceApp), ...(targetApp ? [closeApp(targetApp)] : [])]);
  }
});

async function selectRestorePath(
  electronApp: ElectronApplication,
  path: string | null,
): Promise<void> {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = () =>
      Promise.resolve(
        selectedPath
          ? { canceled: false, filePaths: [selectedPath] }
          : { canceled: true, filePaths: [] },
      );
  }, path);
}

async function expectOriginalData(
  userDataPath: string,
  retainedFilePath: string,
  stateJson: string,
): Promise<void> {
  await expect(readFile(join(userDataPath, "state.json"), "utf8")).resolves.toBe(stateJson);
  await expect(readFile(retainedFilePath, "utf8")).resolves.toBe("original retained data");
}
