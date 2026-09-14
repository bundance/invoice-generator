import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { IssuerSettingsSaveResult } from "../../application/invoice-application-contract.ts";
import type { IssuerSettingsInput } from "../../domain/issuer/issuer-settings.ts";
import { completeIssuer, completeIssuerInput } from "../../../tests/fixtures/issuer-settings.ts";
import App from "./app.tsx";
import {
  businessDate,
  deferred,
  type Deferred,
  emptyWorkspace,
  savedIssuerSettings,
  unusedInvoiceAppCommands,
} from "./app-test-support.ts";

describe("empty workspace", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () => Promise.resolve(emptyWorkspace),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
  });

  it("shows every Document studio destination and its next workspace step", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Create invoice" })).toBeVisible();
    expect(screen.getByLabelText("Invoice preview")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Add issuer details" }));
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    expect(screen.getByText("Next: add issuer details.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create backup" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Restore backup" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Invoices" }));
    expect(screen.getByRole("heading", { name: "No issued invoices yet" })).toBeVisible();
    await user.click(
      within(screen.getByRole("main")).getByRole("button", { name: "Create invoice" }),
    );
    expect(screen.getByRole("heading", { level: 1, name: "Create invoice" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clients" }));
    expect(screen.getByRole("heading", { name: "No clients yet" })).toBeVisible();
    expect(
      screen.getByText("Next: create the first client and invoice number series."),
    ).toBeVisible();
  });

  it("autosaves complete issuer settings for future documents", async () => {
    const savedInputs: IssuerSettingsInput[] = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () => Promise.resolve(emptyWorkspace),
      saveIssuerSettings: (issuerInput) => {
        savedInputs.push(issuerInput);
        return new Promise((resolve) => {
          window.setTimeout(() => resolve(savedIssuerSettings(issuerInput)), 500);
        });
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Legal name"), completeIssuerInput.legalName);
    await user.type(
      screen.getByLabelText("Registered address"),
      completeIssuerInput.registeredAddress,
    );
    await user.type(screen.getByLabelText("Company number"), completeIssuerInput.companyNumber);
    await user.type(
      screen.getByLabelText("VAT registration number"),
      completeIssuerInput.vatRegistrationNumber,
    );
    await user.type(screen.getByLabelText("Bank name"), completeIssuerInput.bankName);
    await user.type(screen.getByLabelText("Sort code"), completeIssuerInput.sortCode);
    await user.type(screen.getByLabelText("Account number"), completeIssuerInput.accountNumber);
    await user.type(
      screen.getByLabelText("Standard VAT rate"),
      completeIssuerInput.standardVatRate,
    );

    expect(screen.getByText("Saving")).toBeVisible();
    await waitFor(() => expect(savedInputs).toEqual([completeIssuerInput]));
    expect(await screen.findByText("Saved on this Mac")).toBeVisible();
  });

  it("flushes a pending autosave once when the owner saves now", async () => {
    const savedInputs: IssuerSettingsInput[] = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () => Promise.resolve(emptyWorkspace),
      saveIssuerSettings: (issuerInput) => {
        savedInputs.push(issuerInput);
        return Promise.resolve(savedIssuerSettings(issuerInput));
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Legal name"), completeIssuerInput.legalName);
    await user.type(
      screen.getByLabelText("Registered address"),
      completeIssuerInput.registeredAddress,
    );
    await user.type(screen.getByLabelText("Company number"), completeIssuerInput.companyNumber);
    await user.type(
      screen.getByLabelText("VAT registration number"),
      completeIssuerInput.vatRegistrationNumber,
    );
    await user.type(screen.getByLabelText("Bank name"), completeIssuerInput.bankName);
    await user.type(screen.getByLabelText("Sort code"), completeIssuerInput.sortCode);
    await user.type(screen.getByLabelText("Account number"), completeIssuerInput.accountNumber);
    await user.type(
      screen.getByLabelText("Standard VAT rate"),
      completeIssuerInput.standardVatRate,
    );
    await user.click(screen.getByRole("button", { name: "Save now" }));

    await waitFor(() => expect(savedInputs).toHaveLength(1));
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    expect(savedInputs).toHaveLength(1);
  });

  it("queues a reverted value after an in-flight autosave", async () => {
    const savedInputs: IssuerSettingsInput[] = [];
    const pendingSaves: Array<Deferred<IssuerSettingsSaveResult>> = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: (issuerInput) => {
        savedInputs.push(issuerInput);
        const pendingSave = deferred<IssuerSettingsSaveResult>();
        pendingSaves.push(pendingSave);
        return pendingSave.promise;
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const legalName = screen.getByLabelText("Legal name");
    await user.clear(legalName);
    await user.type(legalName, "Codernetic Studio Ltd");
    await waitFor(() => expect(savedInputs).toHaveLength(1));

    await user.clear(legalName);
    await user.type(legalName, completeIssuer.legalName);
    const firstPendingSave = pendingSaves[0];
    const firstSavedInput = savedInputs[0];
    if (!firstPendingSave || !firstSavedInput) throw new Error("Expected the first issuer save");
    firstPendingSave.resolve(savedIssuerSettings(firstSavedInput));

    await waitFor(() => expect(savedInputs).toHaveLength(2));
    const secondPendingSave = pendingSaves[1];
    const secondSavedInput = savedInputs[1];
    if (!secondPendingSave || !secondSavedInput)
      throw new Error("Expected the reverted issuer save");
    expect(secondSavedInput.legalName).toBe(completeIssuer.legalName);
    expect(screen.getByText("Saving")).toBeVisible();

    secondPendingSave.resolve(savedIssuerSettings(secondSavedInput));
    expect(await screen.findByText("Saved on this Mac")).toBeVisible();
    expect(legalName).toHaveValue(completeIssuer.legalName);
  });

  it("does not duplicate a successful in-flight autosave when the owner saves now", async () => {
    const savedInputs: IssuerSettingsInput[] = [];
    const pendingSave = deferred<IssuerSettingsSaveResult>();
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: (issuerInput) => {
        savedInputs.push(issuerInput);
        return pendingSave.promise;
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const legalName = screen.getByLabelText("Legal name");
    await user.clear(legalName);
    await user.type(legalName, "Codernetic Studio Ltd");
    await waitFor(() => expect(savedInputs).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Save now" }));
    expect(savedInputs).toHaveLength(1);
    const savedInput = savedInputs[0];
    if (!savedInput) throw new Error("Expected the in-flight issuer save");
    pendingSave.resolve(savedIssuerSettings(savedInput));

    expect(await screen.findByText("Saved on this Mac")).toBeVisible();
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    expect(savedInputs).toHaveLength(1);
  });

  it("reports one failed in-flight autosave when the owner saves now", async () => {
    const savedInputs: IssuerSettingsInput[] = [];
    const pendingSave = deferred<IssuerSettingsSaveResult>();
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: (issuerInput) => {
        savedInputs.push(issuerInput);
        return pendingSave.promise;
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const legalName = screen.getByLabelText("Legal name");
    await user.clear(legalName);
    await user.type(legalName, "Codernetic Studio Ltd");
    await waitFor(() => expect(savedInputs).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Save now" }));
    expect(savedInputs).toHaveLength(1);
    pendingSave.resolve({ kind: "failed", message: "disk unavailable" });

    expect(
      await screen.findByText("Could not save issuer settings. Your edits are still here."),
    ).toBeVisible();
    expect(legalName).toHaveValue("Codernetic Studio Ltd");
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(savedInputs).toHaveLength(1);
  });

  it("finishes a pending settings save after navigating away", async () => {
    const savedInputs: IssuerSettingsInput[] = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: (issuerInput) => {
        savedInputs.push(issuerInput);
        return Promise.resolve(savedIssuerSettings(issuerInput));
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const legalName = screen.getByLabelText("Legal name");
    await user.clear(legalName);
    await user.type(legalName, "Codernetic Studio Ltd");
    await user.click(screen.getByRole("button", { name: "Invoices" }));

    await waitFor(() => expect(savedInputs).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Legal name")).toHaveValue("Codernetic Studio Ltd");
    expect(screen.getByText("Saved on this Mac")).toBeVisible();
  });

  it("reveals field errors after blur or save and updates them during correction", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(screen.queryByText("Enter a nine-digit UK VAT registration number.")).toBeNull();

    const companyNumber = screen.getByLabelText("Company number");
    await user.type(companyNumber, "GB 8822243");
    await user.tab();
    expect(
      screen.getByText("Enter 1 to 8 letters or digits in the certificate form."),
    ).toBeVisible();

    await user.clear(companyNumber);
    await user.type(companyNumber, "8822243");
    expect(
      screen.queryByText("Enter 1 to 8 letters or digits in the certificate form."),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save now" }));
    expect(screen.getByText("Enter a nine-digit UK VAT registration number.")).toBeVisible();
    expect(screen.getByText("Enter the issuer's registered address.")).toBeVisible();
  });

  it("keeps edits after a failed write and retries the latest values", async () => {
    const savedInputs: IssuerSettingsInput[] = [];
    let writeShouldFail = true;
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: (issuerInput) => {
        savedInputs.push(issuerInput);
        if (writeShouldFail) {
          return Promise.resolve({ kind: "failed", message: "disk unavailable" });
        }
        return Promise.resolve(savedIssuerSettings(issuerInput));
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const legalName = screen.getByLabelText("Legal name");
    await user.clear(legalName);
    await user.type(legalName, "Codernetic Studio Ltd");

    expect(
      await screen.findByText("Could not save issuer settings. Your edits are still here."),
    ).toBeVisible();
    expect(legalName).toHaveValue("Codernetic Studio Ltd");

    await user.click(screen.getByRole("button", { name: "Invoices" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Legal name")).toHaveValue("Codernetic Studio Ltd");
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();

    await user.type(screen.getByLabelText("Legal name"), " UK");
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    expect(savedInputs).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();

    writeShouldFail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Saved on this Mac")).toBeVisible();
    expect(savedInputs.at(-1)?.legalName).toBe("Codernetic Studio Ltd UK");
  });
});
