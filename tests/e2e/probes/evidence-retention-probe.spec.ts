import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "../support/electron-test-app.js";

test("failure evidence probe retains every diagnostic", async () => {
  const userDataPath = await createUserDataPath("failure-evidence-probe");
  await writeFile(join(userDataPath, "probe-marker.txt"), "retained dataset marker");
  const electronApplication = await launchProductionApp(userDataPath);
  const page = await electronApplication.firstWindow();

  await page.evaluate("console.error('renderer failure evidence probe')");
  await electronApplication.evaluate(() => {
    process.stdout.write("main stdout failure evidence probe\n");
    process.stderr.write("main stderr failure evidence probe\n");
  });
  await expect(page.getByRole("heading", { level: 1, name: "Create invoice" })).toBeVisible();
  expect("intentional failure").toBe("retained evidence");
});
