import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { ClientSaveResult } from "../../../application/invoice-application-contract.ts";
import { type ClientInput, persistedClientSchema } from "../../../domain/clients/client.ts";
import { parseIssuerSettingsInput } from "../../../domain/issuer/issuer-settings.ts";
import {
  completeClient,
  completeClientFields,
  completeClientInput,
} from "../../../../tests/fixtures/client.ts";
import { completeIssuer, completeIssuerInput } from "../../../../tests/fixtures/issuer-settings.ts";
import { completeIssuedInvoice } from "../../../../tests/fixtures/issued-invoice.ts";
import App from "../../app/app.tsx";
import {
  businessDate,
  deferred,
  emptyWorkspace,
  makeOtherClient,
  replaceField,
  unusedInvoiceAppCommands,
} from "../../app/app-test-support.ts";

describe("client management", () => {
  afterEach(cleanup);

  it("creates the first client from the empty state and leaves invoices blocked on issuer setup", async () => {
    const createdInputs: ClientInput[] = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      createClient: (input) => {
        createdInputs.push(input);
        return Promise.resolve({ kind: "saved", client: completeClient });
      },
      loadWorkspace: () => Promise.resolve(emptyWorkspace),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
      updateClient: unusedInvoiceAppCommands.updateClient,
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Clients" }));
    await user.click(screen.getByRole("button", { name: "Create first client" }));
    expect(screen.getByRole("heading", { name: "New client" })).toBeVisible();

    await fillClientForm(user, completeClientInput);
    await user.click(screen.getByRole("button", { name: "Create client" }));

    await waitFor(() => expect(createdInputs).toHaveLength(1));
    expect(createdInputs[0]).toEqual(completeClientInput);
    expect(await screen.findByText("Client saved on this Mac")).toBeVisible();
    expect(screen.getByRole("button", { name: /Genesis Global/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(screen.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add issuer details" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create first client" })).not.toBeInTheDocument();
    expect(screen.queryByText("Draft defaults ready for Genesis Global.")).not.toBeInTheDocument();
    expect(createdInputs).toHaveLength(1);
  });

  it("shows only the missing setup requirement before creating an invoice", async () => {
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
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("First client")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create first client" })).toBeVisible();
    expect(screen.queryByText("Issuer details")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add issuer details" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create first client" }));
    expect(screen.getByRole("heading", { name: "No clients yet" })).toBeVisible();
  });

  it("prefills a new UK-taxable client with the issuer's standard VAT rate", async () => {
    const issuerWithRate = parseIssuerSettingsInput({
      ...completeIssuerInput,
      standardVatRate: "17.5",
    });
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
            issuer: issuerWithRate,
          },
        }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Clients" }));
    await user.click(screen.getByRole("button", { name: "Create first client" }));

    expect(screen.getByLabelText("Default VAT rate")).toHaveValue("17.5");
  });

  it("makes client defaults available only when issuer and client setup are complete", async () => {
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    render(<App />);

    expect(await screen.findByRole("combobox", { name: "Client" })).toHaveValue(completeClient.id);
    expect(screen.getByText("Draft defaults ready for Genesis Global.")).toBeVisible();
    expect(screen.getByText("GGIOHK-0043")).toBeVisible();
    expect(screen.getByText("USD 725 per day")).toBeVisible();
  });

  it("edits one client without changing another client's defaults or counters", async () => {
    const otherClient = makeOtherClient();
    const updatedInputs: Array<Readonly<{ id: string; input: ClientInput }>> = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      createClient: unusedInvoiceAppCommands.createClient,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient, otherClient],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
      updateClient: (clientId, input) => {
        updatedInputs.push({ id: clientId, input });
        return Promise.resolve({
          kind: "saved",
          client: persistedClientSchema.parse({
            ...completeClient,
            ...completeClientFields,
            legalName: input.legalName,
            paymentTerms: input.paymentTerms,
          }),
        });
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Clients" }));
    await user.click(screen.getByRole("button", { name: /Genesis Global/ }));
    const paymentTerms = screen.getByLabelText("Payment terms");
    await user.clear(paymentTerms);
    await user.type(paymentTerms, "Due on receipt");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatedInputs).toHaveLength(1));
    expect(screen.getAllByText("Client saved on this Mac")).toHaveLength(1);
    expect(updatedInputs[0]).toMatchObject({
      id: completeClient.id,
      input: {
        legalName: completeClient.legalName,
        invoicePrefix: "GGIOHK",
        nextInvoiceNumber: "43",
        paymentTerms: "Due on receipt",
      },
    });

    await user.clear(screen.getByLabelText("Payment terms"));
    await user.type(screen.getByLabelText("Payment terms"), "Due within 7 days");
    expect(screen.queryByText("Client saved on this Mac")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Payment terms")).toHaveValue("Due on receipt");

    await user.click(screen.getByRole("button", { name: /Acme Research Ltd/ }));
    expect(screen.getByLabelText("Next invoice number")).toHaveValue("9007199254740993");

    await user.clear(screen.getByLabelText("Payment terms"));
    await user.type(screen.getByLabelText("Payment terms"), "Unsaved second-client terms");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Acme Research Ltd" })).toBeVisible();
    expect(screen.getByLabelText("Payment terms")).toHaveValue(completeClient.paymentTerms);
  });

  it("locks a used client and starts a separate client from its current details", async () => {
    const createdInputs: ClientInput[] = [];
    const usedClient = persistedClientSchema.parse({
      ...completeClient,
      invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
    });
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      createClient: (input) => {
        createdInputs.push(input);
        return Promise.resolve({
          kind: "saved",
          client: persistedClientSchema.parse({
            ...completeClient,
            id: "647253f4-113c-4d84-8381-c219776b7469",
            legalName: input.legalName,
            postalAddress: input.postalAddress,
            invoiceSequence: { prefix: input.invoicePrefix, nextNumber: input.nextInvoiceNumber },
          }),
        });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [usedClient],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [completeIssuedInvoice],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
      updateClient: unusedInvoiceAppCommands.updateClient,
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Clients" }));
    expect(
      screen.getByText("Identity and invoice numbering are locked after first issue."),
    ).toBeVisible();
    expect(screen.getByLabelText("Legal name")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Postal address")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Invoice prefix")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Next invoice number")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Payment terms")).not.toHaveAttribute("readonly");

    await user.click(screen.getByRole("button", { name: "Create new from this client" }));
    expect(screen.getByRole("heading", { name: "New client" })).toBeVisible();
    expect(screen.getByLabelText("Legal name")).toHaveValue(completeClient.legalName);
    expect(screen.getByLabelText("Legal name")).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Invoice prefix")).toHaveValue("");
    expect(screen.getByLabelText("Next invoice number")).toHaveValue("1");

    await replaceField(user, "Legal name", "Genesis Global UK");
    await replaceField(user, "Postal address", "4 New Street\nLondon\nW1 1AA");
    await replaceField(user, "Invoice prefix", "GENUK");
    await user.click(screen.getByRole("button", { name: "Create client" }));

    await waitFor(() => expect(createdInputs).toHaveLength(1));
    expect(createdInputs[0]).toMatchObject({
      legalName: "Genesis Global UK",
      postalAddress: "4 New Street\nLondon\nW1 1AA",
      invoicePrefix: "GENUK",
      nextInvoiceNumber: "1",
      paymentTerms: completeClientInput.paymentTerms,
    });
    expect(usedClient.invoiceSequence).toEqual({ prefix: "GGIOHK", nextNumber: "44" });
  });

  it("shows client validation after blur and keeps edits after a failed save", async () => {
    let saveShouldFail = true;
    const submittedInputs: ClientInput[] = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      createClient: (input) => {
        submittedInputs.push(input);
        return Promise.resolve(
          saveShouldFail
            ? { kind: "failed", message: "disk unavailable" }
            : { kind: "saved", client: completeClient },
        );
      },
      loadWorkspace: () => Promise.resolve(emptyWorkspace),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
      updateClient: unusedInvoiceAppCommands.updateClient,
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Clients" }));
    await user.click(screen.getByRole("button", { name: "Create first client" }));
    await user.type(screen.getByLabelText("Invoice prefix"), "A-1");
    await user.tab();
    expect(screen.getByText("Use 2 to 12 letters or digits without a hyphen.")).toBeVisible();
    await fillClientForm(user, completeClientInput);
    await user.click(screen.getByRole("button", { name: "Create client" }));

    expect(
      await screen.findByText("Could not save client. Your edits are still here."),
    ).toBeVisible();
    expect(screen.getByLabelText("Legal name")).toHaveValue(completeClientInput.legalName);
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();

    saveShouldFail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Client saved on this Mac")).toBeVisible();
    expect(submittedInputs).toHaveLength(2);
  });

  it("preserves edits made while a client save is in flight", async () => {
    const firstSave = deferred<ClientSaveResult>();
    const submittedInputs: ClientInput[] = [];
    window.invoiceApp = {
      ...unusedInvoiceAppCommands,
      createClient: unusedInvoiceAppCommands.createClient,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            currentBusinessDate: businessDate,
            draft: null,
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
      updateClient: (_clientId, input) => {
        submittedInputs.push(input);
        if (submittedInputs.length === 1) return firstSave.promise;
        return Promise.resolve({
          kind: "saved",
          client: persistedClientSchema.parse({
            ...completeClient,
            paymentTerms: input.paymentTerms,
          }),
        });
      },
    };
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Clients" }));
    await user.click(screen.getByRole("button", { name: /Genesis Global/ }));
    const paymentTerms = screen.getByLabelText("Payment terms");
    await user.clear(paymentTerms);
    await user.type(paymentTerms, "Submitted terms");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(submittedInputs).toHaveLength(1));

    await user.clear(paymentTerms);
    await user.type(paymentTerms, "Latest terms");
    firstSave.resolve({
      kind: "saved",
      client: persistedClientSchema.parse({
        ...completeClient,
        paymentTerms: "Submitted terms",
      }),
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
    expect(paymentTerms).toHaveValue("Latest terms");
    expect(screen.queryByText("Client saved on this Mac")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(submittedInputs).toHaveLength(2));
    expect(submittedInputs[1]?.paymentTerms).toBe("Latest terms");
    expect(await screen.findByText("Client saved on this Mac")).toBeVisible();
  });
});

async function fillClientForm(user: ReturnType<typeof userEvent.setup>, input: ClientInput) {
  await replaceField(user, "Legal name", input.legalName);
  await replaceField(user, "Postal address", input.postalAddress);
  await user.selectOptions(screen.getByLabelText("Currency"), input.currencyCode);
  await replaceField(user, "Standard day rate", input.standardDayRate);
  await user.selectOptions(screen.getByLabelText("VAT treatment"), input.vatTreatment);
  if (input.vatTreatment === "uk-taxable") {
    await replaceField(user, "Default VAT rate", input.vatRate);
  } else {
    await replaceField(
      user,
      "Outside-scope evidence reference",
      input.outsideScopeEvidenceReference,
    );
    if (input.reverseCharge) await user.click(screen.getByLabelText("Reverse charge applies"));
  }
  await replaceField(user, "Default service description", input.defaultServiceDescription);
  await replaceField(user, "Payment terms", input.paymentTerms);
  await replaceField(user, "Invoice prefix", input.invoicePrefix);
  await replaceField(user, "Next invoice number", input.nextInvoiceNumber);
}
