import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "playwright";

import { initialWorkspaceState, type WorkspaceState } from "../../src/application/workspace.js";
import { type ClientInput, persistedClientSchema } from "../../src/domain/clients/client.js";
import { persistedIssuedInvoiceSchema } from "../../src/domain/invoices/issued-invoice.js";
import {
  parseWorkspaceState,
  serializeWorkspaceState,
} from "../../src/infrastructure/persistence/workspace-state.js";
import {
  completeClient,
  completeClientFields,
  completeClientInput,
  completeGbpVatClientInput,
} from "../fixtures/client.js";
import { completeIssuedInvoice } from "../fixtures/issued-invoice.js";
import { completeIssuer, completeIssuerInput } from "../fixtures/issuer-settings.js";
import {
  closeApp,
  createUserDataPath,
  expect,
  launchProductionApp,
  test,
} from "./support/electron-test-app.js";

test("a UI-created issuer and UK-taxable client can start an invoice", async () => {
  const userDataPath = await createUserDataPath("ui-created-invoice");
  const electronApp = await launchProductionApp(userDataPath);

  try {
    const page = await electronApp.firstWindow();
    const rendererErrors: string[] = [];
    page.on("pageerror", (error) => rendererErrors.push(error.message));

    await page.getByRole("button", { name: "Settings" }).click();
    await fillIssuer(page);
    await expect(page.getByText("Saved on this Mac")).toBeVisible();

    await page.getByRole("button", { name: "Clients" }).click();
    await page.getByRole("button", { name: "Create first client" }).click();
    await fillClient(page, completeGbpVatClientInput);
    await page.getByRole("button", { name: "Create client" }).click();
    await expect(page.getByText("Client saved on this Mac")).toBeVisible();
    const savedClientId = (await readWorkspaceState(userDataPath)).clients[0]?.id;
    if (!savedClientId) throw new Error("The saved client does not have an ID");

    await page.getByRole("banner").getByRole("button", { name: "Create invoice" }).click();

    try {
      await expect(page.getByRole("heading", { level: 1, name: "Create invoice" })).toBeVisible();
    } catch (error) {
      throw new Error(`Create invoice renderer errors: ${rendererErrors.join("\n") || "none"}`, {
        cause: error,
      });
    }
    expect(rendererErrors).toEqual([]);
    await expect(page.getByRole("combobox", { name: "Client" })).toHaveValue(savedClientId);
    await expect(page.getByText("Draft defaults ready for Acme Research Ltd.")).toBeVisible();
  } finally {
    await closeApp(electronApp);
  }
});

test("clients are atomically saved, edited, restored, and copied without using a number", async () => {
  const userDataPath = await createUserDataPath("clients");
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({ ...initialWorkspaceState, issuer: completeIssuer }),
  );
  let electronApp = await launchProductionApp(userDataPath);

  try {
    let page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Clients" }).click();
    await page.getByRole("button", { name: "Create first client" }).click();
    await fillClient(page);
    await page.getByRole("button", { name: "Create client" }).click();

    await expect(page.getByText("Client saved on this Mac")).toBeVisible();
    const createdState = await readWorkspaceState(userDataPath);
    const clientId = createdState.clients[0]?.id;
    expect(createdState.clients).toEqual([{ id: expect.any(String), ...completeClientFields }]);
    if (!clientId) throw new Error("The saved client does not have an ID");
    await expect(access(join(userDataPath, "state.json.tmp"))).rejects.toThrow();

    const revisedPaymentTerms = "Due within 14 days";
    await page.getByLabel("Payment terms").fill(revisedPaymentTerms);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect
      .poll(async () => (await readWorkspaceState(userDataPath)).clients[0]?.paymentTerms)
      .toBe(revisedPaymentTerms);

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Clients" }).click();

    await expect(
      page.getByRole("heading", { level: 2, name: completeClientInput.legalName }),
    ).toBeVisible();
    await expect(page.getByLabel("Payment terms")).toHaveValue(revisedPaymentTerms);
    await expect(page.getByLabel("Invoice prefix")).toHaveValue(completeClientInput.invoicePrefix);
    await expect(page.getByLabel("Next invoice number")).toHaveValue(
      completeClientInput.nextInvoiceNumber,
    );

    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByRole("combobox", { name: "Client" })).toHaveValue(clientId);
    await expect(page.getByText("GGIOHK-0043", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Selecting a client copies these defaults. It uses no number."),
    ).toBeVisible();

    const stateAfterSelection = await readWorkspaceState(userDataPath);
    expect(stateAfterSelection.clients[0]?.invoiceSequence.nextNumber).toBe("43");
  } finally {
    await closeApp(electronApp);
  }
});

test("a used client stays locked while copied clients and future defaults remain independent", async () => {
  const userDataPath = await createUserDataPath("locked-client-history");
  const retainedBytes = Buffer.from("%PDF-1.7\nhistorical invoice fixture\n", "utf8");
  const retainedPdf = {
    filename: completeIssuedInvoice.retainedPdf.filename,
    sha256: createHash("sha256").update(retainedBytes).digest("hex"),
  };
  const historicalInvoice = persistedIssuedInvoiceSchema.parse({
    ...completeIssuedInvoice,
    retainedPdf,
  });
  const usedClient = persistedClientSchema.parse({
    ...completeClient,
    invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
  });
  await mkdir(join(userDataPath, "retained-pdfs"));
  await writeFile(join(userDataPath, "retained-pdfs", retainedPdf.filename), retainedBytes);
  await writeFile(
    join(userDataPath, "state.json"),
    serializeWorkspaceState({
      ...initialWorkspaceState,
      clients: [usedClient],
      issuedInvoices: [historicalInvoice],
      issuer: completeIssuer,
    }),
  );
  let electronApp = await launchProductionApp(userDataPath);

  try {
    let page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Clients" }).click();
    await expect(
      page.getByText("Identity and invoice numbering are locked after first issue."),
    ).toBeVisible();
    await expect(page.getByLabel("Legal name")).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Postal address")).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Invoice prefix")).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Next invoice number")).toHaveAttribute("readonly", "");

    await page.getByLabel("Standard day rate").fill("900");
    await page.getByLabel("Payment terms").fill("Due within 14 days");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Client saved on this Mac")).toBeVisible();

    await page.getByRole("button", { name: "Create new from this client" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "New client" })).toBeVisible();
    await expect(page.getByLabel("Legal name")).toHaveValue(completeClient.legalName);
    await expect(page.getByLabel("Invoice prefix")).toHaveValue("");
    await expect(page.getByLabel("Next invoice number")).toHaveValue("1");
    await page.getByLabel("Legal name").fill("Genesis Global UK");
    await page.getByLabel("Postal address").fill("4 New Street\nLondon\nW1 1AA");
    await page.getByLabel("Invoice prefix").fill("GENUK");
    await page.getByRole("button", { name: "Create client" }).click();
    await expect(page.getByText("Client saved on this Mac")).toBeVisible();

    let workspace = await readWorkspaceState(userDataPath);
    expect(workspace.clients).toHaveLength(2);
    expect(workspace.clients[0]).toMatchObject({
      id: usedClient.id,
      legalName: completeClient.legalName,
      invoiceSequence: { prefix: "GGIOHK", nextNumber: "44" },
      paymentTerms: "Due within 14 days",
      standardDayRate: "900",
    });
    expect(workspace.clients[1]).toMatchObject({
      legalName: "Genesis Global UK",
      invoiceSequence: { prefix: "GENUK", nextNumber: "1" },
      paymentTerms: "Due within 14 days",
      standardDayRate: "900",
    });
    expect(workspace.clients[1]?.id).not.toBe(usedClient.id);

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Legal name").fill("Codernetic Future Ltd");
    await page.getByRole("button", { name: "Save now" }).click();
    await expect(page.getByText("Saved on this Mac")).toBeVisible();
    await page.getByRole("button", { name: "Invoices" }).click();
    const invoiceRecord = page.getByRole("article", { name: "Invoice GGIOHK-0043" });
    await expect(invoiceRecord).toContainText("Genesis Global");
    await expect(invoiceRecord).toContainText("Codernetic Ltd");
    await expect(invoiceRecord).not.toContainText("Genesis Global UK");
    await expect(invoiceRecord).not.toContainText("Codernetic Future Ltd");
    await expect(invoiceRecord).toContainText("USD 2,900.00");
    await expect(
      readFile(join(userDataPath, "retained-pdfs", retainedPdf.filename)),
    ).resolves.toEqual(retainedBytes);

    await closeApp(electronApp);
    electronApp = await launchProductionApp(userDataPath);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Clients" }).click();
    await expect(page.getByLabel("Legal name")).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Standard day rate")).toHaveValue("900");
    await expect(page.getByLabel("Payment terms")).toHaveValue("Due within 14 days");
    await page.getByRole("button", { name: "Invoices" }).click();
    await expect(page.getByRole("article", { name: "Invoice GGIOHK-0043" })).toContainText(
      "Codernetic Ltd",
    );
    workspace = await readWorkspaceState(userDataPath);
    expect(workspace.issuedInvoices).toEqual([historicalInvoice]);
    await expect(
      readFile(join(userDataPath, "retained-pdfs", retainedPdf.filename)),
    ).resolves.toEqual(retainedBytes);
  } finally {
    await closeApp(electronApp);
  }
});

async function fillClient(page: Page, input: ClientInput = completeClientInput): Promise<void> {
  await page.getByLabel("Legal name").fill(input.legalName);
  await page.getByLabel("Postal address").fill(input.postalAddress);
  await page.getByLabel("Currency").selectOption(input.currencyCode);
  await page.getByLabel("Standard day rate").fill(input.standardDayRate);
  await page.getByLabel("VAT treatment").selectOption(input.vatTreatment);
  if (input.vatTreatment === "uk-taxable") {
    await page.getByLabel("VAT rate").fill(input.vatRate);
  } else {
    await page
      .getByLabel("Outside-scope evidence reference")
      .fill(input.outsideScopeEvidenceReference);
    if (input.reverseCharge) await page.getByLabel("Reverse charge applies").check();
  }
  await page.getByLabel("Default service description").fill(input.defaultServiceDescription);
  await page.getByLabel("Payment terms").fill(input.paymentTerms);
  await page.getByLabel("Invoice prefix").fill(input.invoicePrefix);
  await page.getByLabel("Next invoice number").fill(input.nextInvoiceNumber);
}

async function fillIssuer(page: Page): Promise<void> {
  await page.getByLabel("Legal name").fill(completeIssuerInput.legalName);
  await page.getByLabel("Registered address").fill(completeIssuerInput.registeredAddress);
  await page.getByLabel("Company number").fill(completeIssuerInput.companyNumber);
  await page.getByLabel("VAT registration number").fill(completeIssuerInput.vatRegistrationNumber);
  await page.getByLabel("Bank name").fill(completeIssuerInput.bankName);
  await page.getByLabel("Sort code").fill(completeIssuerInput.sortCode);
  await page.getByLabel("Account number").fill(completeIssuerInput.accountNumber);
  await page.getByLabel("Standard VAT rate").fill(completeIssuerInput.standardVatRate);
}

async function readWorkspaceState(userDataPath: string): Promise<WorkspaceState> {
  return parseWorkspaceState(await readFile(join(userDataPath, "state.json"), "utf8"));
}
