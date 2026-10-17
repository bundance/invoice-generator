import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { initialWorkspaceState } from "../../src/application/workspace.js";
import { serializeWorkspaceState } from "../../src/infrastructure/persistence/workspace-state.js";
import { completeClient } from "../fixtures/client.js";
import { completeIssuer } from "../fixtures/issuer-settings.js";
import {
  closeApp,
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "./support/electron-test-app.js";

test("invoice periods suggest editable weeks and keep the date range together", async () => {
  const userDataPath = await createUserDataPath("invoice-period-defaults");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: completeIssuer,
    }),
  );
  const app = await launchProductionApp(userDataPath);
  try {
    const page = await app.firstWindow();
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Period start").fill("2026-08-03");
    await expect(page.getByLabel("Period end")).toHaveValue("2026-08-09");
    await expect(page.getByLabel("Billable days")).toHaveValue("5");
    await page.getByLabel("Period end").fill("2026-08-12");
    await expect(page.getByLabel("Billable days")).toHaveValue("8");
    await page.getByLabel("Billable days").fill("6.5");
    await page.getByRole("button", { name: "+ Add item" }).click();
    const secondItem = page.locator(".invoice-item").nth(1);
    await secondItem.getByLabel("Period start").click();
    await expect(secondItem.getByLabel("Period start")).toHaveValue("2026-08-17");
    await expect(secondItem.getByLabel("Period end")).toHaveValue("2026-08-23");
    await expect(secondItem.getByLabel("Billable days")).toHaveValue("5");
    await secondItem.getByLabel("Period start").fill("2026-08-19");
    await expect(secondItem.getByLabel("Billable days")).toHaveValue("3");
    await page.getByRole("button", { name: /1.*React Native consultancy/s }).click();
    await expect(page.locator(".invoice-item--active").getByLabel("Billable days")).toHaveValue(
      "6.5",
    );

    const preview = page.getByLabel("Invoice preview");
    await expect(preview.locator(".billing-pdf-preview__page canvas").first()).toBeVisible();
    const dateRange = preview
      .locator(".textLayer span")
      .filter({ hasText: "Invoice period: 2026-08-03 - 2026-08-12" });
    await expect(dateRange).toBeVisible();
    await expect(dateRange).toHaveText("Invoice period: 2026-08-03 - 2026-08-12");
    const layout = await dateRange.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lineTops = [...new Set(Array.from(range.getClientRects(), (rect) => rect.top))];
      const pdfPage = element.closest(".billing-pdf-preview__page");
      if (!pdfPage) throw new Error("Expected the generated PDF page");
      const textBox = element.getBoundingClientRect();
      const pageBox = pdfPage.getBoundingClientRect();
      return {
        lineCount: lineTops.length,
        fits: textBox.left >= pageBox.left && textBox.right <= pageBox.right,
      };
    });
    const description = preview
      .locator(".textLayer span")
      .filter({ hasText: /^Project delivery$/u })
      .first();
    const [dateBox, descriptionBox] = await Promise.all([
      dateRange.boundingBox(),
      description.boundingBox(),
    ]);
    if (!dateBox || !descriptionBox)
      throw new Error("Expected the generated service description and period");
    expect(dateBox.y).toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height - 1);
    expect(layout.lineCount).toBe(1);
    expect(layout.fits).toBe(true);
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
  } finally {
    await closeApp(app);
  }
});
