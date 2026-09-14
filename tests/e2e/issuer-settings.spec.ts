import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "playwright";

import { completeIssuer, completeIssuerInput } from "../fixtures/issuer-settings.js";
import {
  closeApp,
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "./support/electron-test-app.js";

test("issuer settings are atomically saved and restored after restart", async () => {
  const userDataPath = await createUserDataPath("issuer-settings");
  let electronApp = await launchProductionApp(userDataPath);

  try {
    let page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Invoice Generator 0.1.0")).toBeVisible();
    await fillIssuerSettings(page);

    await expect(page.getByText("Saving")).toBeVisible();
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    const savedState = JSON.parse(await readFile(join(userDataPath, "state.json"), "utf8"));
    expect(savedState.issuer).toEqual(completeIssuer);
    await expect(access(join(userDataPath, "state.json.tmp"))).rejects.toThrow();

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page.getByLabel("Legal name")).toHaveValue(completeIssuer.legalName);
    await expect(page.getByLabel("Registered address")).toHaveValue(
      completeIssuer.registeredAddress,
    );
    await expect(page.getByLabel("VAT registration number")).toHaveValue(
      completeIssuer.vatRegistrationNumber,
    );
    await expect(page.getByLabel("Sort code")).toHaveValue(completeIssuer.sortCode);
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
  } finally {
    await closeApp(electronApp);
  }
});

test("a failed issuer write keeps edits and retries through the production boundary", async () => {
  const userDataPath = await createUserDataPath("issuer-write-failure");
  const temporaryStatePath = join(userDataPath, "state.json.tmp");
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Settings" }).click();
    await fillIssuerFields(page);
    await mkdir(temporaryStatePath);
    await page.getByLabel("Standard VAT rate").fill(completeIssuerInput.standardVatRate);

    await expect(
      page.getByText("Could not save issuer settings. Your edits are still here."),
    ).toBeVisible();
    await expect(page.getByLabel("Legal name")).toHaveValue(completeIssuerInput.legalName);
    const unchangedState = JSON.parse(await readFile(join(userDataPath, "state.json"), "utf8"));
    expect(unchangedState.issuer).toBeNull();

    await rm(temporaryStatePath, { recursive: true });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    const retriedState = JSON.parse(await readFile(join(userDataPath, "state.json"), "utf8"));
    expect(retriedState.issuer).toEqual(completeIssuer);
  } finally {
    await closeApp(electronApp);
  }
});

test("production launch refuses non-canonical persisted issuer settings", async () => {
  const userDataPath = await createUserDataPath("invalid-issuer");
  const invalidState = JSON.stringify({
    schemaVersion: 2,
    issuer: { ...completeIssuer, vatRegistrationNumber: "GB 388 8021 60" },
    clients: [],
    invoiceDraft: null,
    issuedInvoices: [],
    creditNotes: [],
    voidedInvoiceNumbers: [],
    replacementLinks: [],
  });
  await writeFile(join(userDataPath, "state.json"), invalidState);
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("heading", { level: 1, name: "Recovery required" })).toBeVisible();
    await expect(page.getByText("Invalid state schema")).toBeVisible();
    expect(await readFile(join(userDataPath, "state.json"), "utf8")).toBe(invalidState);
  } finally {
    await closeApp(electronApp);
  }
});

test("production launch refuses malformed persisted issuer settings", async () => {
  const userDataPath = await createUserDataPath("malformed-issuer");
  const malformedState = JSON.stringify({
    schemaVersion: 2,
    issuer: { ...completeIssuer, legalName: 42 },
    clients: [],
    invoiceDraft: null,
    issuedInvoices: [],
    creditNotes: [],
    voidedInvoiceNumbers: [],
    replacementLinks: [],
  });
  await writeFile(join(userDataPath, "state.json"), malformedState);
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("heading", { level: 1, name: "Recovery required" })).toBeVisible();
    await expect(page.getByText("Invalid state schema")).toBeVisible();
    expect(await readFile(join(userDataPath, "state.json"), "utf8")).toBe(malformedState);
  } finally {
    await closeApp(electronApp);
  }
});

async function fillIssuerSettings(page: Page): Promise<void> {
  await fillIssuerFields(page);
  await page.getByLabel("Standard VAT rate").fill(completeIssuerInput.standardVatRate);
}

async function fillIssuerFields(page: Page): Promise<void> {
  await page.getByLabel("Legal name").fill(completeIssuerInput.legalName);
  await page.getByLabel("Registered address").fill(completeIssuerInput.registeredAddress);
  await page.getByLabel("Company number").fill(completeIssuerInput.companyNumber);
  await page.getByLabel("VAT registration number").fill(completeIssuerInput.vatRegistrationNumber);
  await page.getByLabel("Bank name").fill(completeIssuerInput.bankName);
  await page.getByLabel("Sort code").fill(completeIssuerInput.sortCode);
  await page.getByLabel("Account number").fill(completeIssuerInput.accountNumber);
}
