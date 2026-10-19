import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { initialWorkspaceState, type WorkspaceState } from "../../src/application/workspace.js";
import {
  parseWorkspaceState,
  serializeWorkspaceState,
} from "../../src/infrastructure/persistence/workspace-state.js";
import { completeClient } from "../fixtures/client.js";
import { completeIssuer } from "../fixtures/issuer-settings.js";
import {
  closeApp,
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "./support/electron-test-app.js";

test("client legal name spans the invoice inspector width", async () => {
  const userDataPath = await createUserDataPath("client-legal-name-width");
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
    const [legalNameBox, postalAddressBox] = await Promise.all([
      page.getByLabel("Client legal name").boundingBox(),
      page.getByLabel("Client postal address").boundingBox(),
    ]);
    if (!legalNameBox || !postalAddressBox) {
      throw new Error("Expected visible client identity fields");
    }

    expect(legalNameBox.x).toBeCloseTo(postalAddressBox.x, 0);
    expect(legalNameBox.width).toBeCloseTo(postalAddressBox.width, 0);
  } finally {
    await closeApp(electronApp);
  }
});

test("an outside-scope draft autosaves, resumes after restart, and discards without using a number", async () => {
  const userDataPath = await createUserDataPath("invoice-draft");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: completeIssuer,
    }),
  );
  let electronApp = await launchProductionApp(userDataPath);

  try {
    let page = await electronApp.firstWindow();
    await page.getByRole("tab", { name: "Work" }).click();
    await page.getByLabel("Billable days").fill("5");
    await page.getByLabel("Notes").fill("Resume this exact draft");

    await expect(page.getByLabel("Invoice preview").getByText("$3,625.00").first()).toBeVisible();
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    await expect
      .poll(async () => (await readWorkspaceState(userDataPath)).draft?.draft.notes)
      .toBe("Resume this exact draft");

    await page.getByRole("button", { name: "Invoices" }).click();
    await page.getByRole("main").getByRole("button", { name: "Create invoice" }).click();
    await page.getByRole("tab", { name: "Work" }).click();
    await expect(page.getByLabel("Notes")).toHaveValue("Resume this exact draft");

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();

    const recoveryDialog = page.getByRole("dialog", { name: "Resume your invoice draft?" });
    await expect(recoveryDialog).toBeVisible();
    await recoveryDialog.getByRole("button", { name: "Resume draft" }).click();
    await page.getByRole("tab", { name: "Work" }).click();
    await expect(page.getByLabel("Notes")).toHaveValue("Resume this exact draft");

    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByText("Not saved yet")).toBeVisible();
    await expect.poll(async () => (await readWorkspaceState(userDataPath)).draft).toBeNull();

    const finalState = await readWorkspaceState(userDataPath);
    expect(finalState.clients[0]?.invoiceSequence.nextNumber).toBe("43");
    expect(finalState.issuedInvoices).toEqual([]);
    expect(finalState.voidedInvoiceNumbers).toEqual([]);
  } finally {
    await closeApp(electronApp);
  }
});

async function readWorkspaceState(userDataPath: string): Promise<WorkspaceState> {
  return parseWorkspaceState(await readFile(join(userDataPath, "state.json"), "utf8"));
}
