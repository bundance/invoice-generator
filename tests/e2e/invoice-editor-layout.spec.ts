import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Locator, Page } from "@playwright/test";

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

test("invoice editor resizes by mouse and keyboard without clipping its controls", async () => {
  const userDataPath = await createUserDataPath("invoice-editor-layout");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: completeIssuer,
    }),
  );
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.locator(".invoice-draft-inspector");
    const handle = page.getByRole("separator", { name: "Resize invoice editor" });
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Billable days").fill("5");

    await dragDivider(page, handle, -600);
    await expect
      .poll(() => editor.evaluate((element) => element.getBoundingClientRect().width))
      .toBeCloseTo(680, 0);
    const start = page.getByLabel("Period start");
    const end = page.getByLabel("Period end");
    await expect
      .poll(async () => (await start.boundingBox())?.y)
      .toBe((await end.boundingBox())?.y);

    await handle.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => editor.evaluate((element) => element.getBoundingClientRect().width))
      .toBeLessThan(679);

    await dragDivider(page, handle, 800);
    await expect
      .poll(() => editor.evaluate((element) => element.getBoundingClientRect().width))
      .toBeCloseTo(360, 0);
    const startBox = await start.boundingBox();
    const endBox = await end.boundingBox();
    if (!startBox || !endBox) throw new Error("Expected visible period fields");
    expect(endBox.y).toBeGreaterThan(startBox.y + startBox.height);
    expect(endBox.x).toBeCloseTo(startBox.x, 0);
    await expectControlsFit(editor);
    const preview = page.getByLabel("Invoice preview");
    await expect(preview.locator(".billing-pdf-preview__page canvas").first()).toBeVisible();
    await expect(preview.locator(".textLayer span").filter({ hasText: /^5$/u })).toHaveCount(1);
    await expect(
      preview.locator(".textLayer span").filter({ hasText: "DRAFT INVOICE" }),
    ).toBeVisible();

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1040, 680);
    });
    await expectControlsFit(editor);
    await expect(page.getByLabel("Billable days")).toHaveValue("5");
    await page.getByLabel("Day rate").fill("525");
    await page.getByRole("button", { name: "Add item", exact: false }).click();
    await expectControlsFit(editor);
    await page.getByRole("tab", { name: "Client", exact: true }).click();
    await expectControlsFit(editor);
    await page.getByRole("tab", { name: "Tax & issue" }).click();
    await expectControlsFit(editor);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await closeApp(electronApp);
  }
});

async function dragDivider(page: Page, handle: Locator, distance: number): Promise<void> {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error("Expected a visible resize divider");
  const x = box.x + box.width / 2;
  const y = Math.max(box.y, 100) + 16;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + distance, y, { steps: 10 });
  await page.mouse.up();
}

async function expectControlsFit(editor: Locator): Promise<void> {
  await expect
    .poll(() =>
      editor.evaluate((element) => {
        const editorBox = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll<HTMLElement>("input, select, textarea, button"))
          .filter((control) => control.getClientRects().length > 0)
          .filter((control) => {
            const box = control.getBoundingClientRect();
            return box.left < editorBox.left || box.right > editorBox.right;
          })
          .map((control) => control.id || control.textContent);
      }),
    )
    .toEqual([]);
}
