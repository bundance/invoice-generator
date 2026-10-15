import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  completeInvoiceDraftInput,
  completeIssuedInvoice,
  completeForeignCurrencyVatIssuedInvoice,
} from "../../../../tests/fixtures/issued-invoice.ts";
import { completeClient } from "../../../../tests/fixtures/client.ts";
import { completeIssuer } from "../../../../tests/fixtures/issuer-settings.ts";
import {
  persistedInvoiceDraftSchema,
  type InvoiceDraftInput,
} from "../../../domain/invoices/invoice-draft.ts";
import {
  persistedIssuedInvoiceSchema,
  type IssuedInvoice,
} from "../../../domain/invoices/issued-invoice.ts";
import type { InvoiceDraftSaveResult } from "../../../application/invoice-application-contract.ts";
import App from "../../app/app.tsx";
import {
  businessDate,
  deferred,
  replaceField,
  unusedInvoiceAppCommands,
} from "../../app/app-test-support.ts";

describe("editable invoice period defaults", () => {
  afterEach(cleanup);

  it("fills Sunday and inclusive workdays, saves them, and allows manual overrides", async () => {
    const savedDrafts = setUpWorkspace();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Work" }));

    await replaceField(user, "Period start", "2026-08-03");
    expect(screen.getByLabelText("Period end")).toHaveValue("2026-08-09");
    expect(screen.getByLabelText("Billable days")).toHaveValue("5");
    await waitFor(() =>
      expect(savedDrafts.at(-1)?.serviceLines[0]).toMatchObject({
        periodStart: "2026-08-03",
        periodEnd: "2026-08-09",
        billableDays: "5",
      }),
    );

    await replaceField(user, "Period end", "2026-08-05");
    expect(screen.getByLabelText("Billable days")).toHaveValue("3");
    await replaceField(user, "Billable days", "2.5");
    await user.click(screen.getByLabelText("Period start"));
    expect(screen.getByLabelText("Period start")).toHaveValue("2026-08-03");
    expect(screen.getByLabelText("Period end")).toHaveValue("2026-08-05");
    expect(screen.getByLabelText("Billable days")).toHaveValue("2.5");
    await waitFor(() => expect(savedDrafts.at(-1)?.serviceLines[0]?.billableDays).toBe("2.5"));

    await replaceField(user, "Period start", "2026-08-10");
    expect(screen.getByLabelText("Period end")).toHaveValue("2026-08-16");
    expect(screen.getByLabelText("Billable days")).toHaveValue("5");
    await user.clear(screen.getByLabelText("Period end"));
    expect(screen.getByLabelText("Period end")).toHaveValue("");
    expect(screen.getByLabelText("Billable days")).toHaveValue("5");
  });

  it("suggests Monday from client history only when an empty start receives focus", async () => {
    const earlierInvoice = persistedIssuedInvoiceSchema.parse({
      ...completeIssuedInvoice,
      serviceLines: completeIssuedInvoice.serviceLines.map((line) => ({
        ...line,
        periodStart: "2026-08-25",
        periodEnd: "2026-08-28",
      })),
    });
    const savedDrafts = setUpWorkspace(null, [
      completeForeignCurrencyVatIssuedInvoice,
      earlierInvoice,
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Work" }));

    expect(screen.getByLabelText("Period start")).toHaveValue("");
    await user.click(screen.getByLabelText("Period start"));
    expect(screen.getByLabelText("Period start")).toHaveValue("2026-08-31");
    expect(screen.getByLabelText("Period end")).toHaveValue("2026-09-06");
    expect(screen.getByLabelText("Billable days")).toHaveValue("5");
    await waitFor(() =>
      expect(savedDrafts.at(-1)?.serviceLines[0]?.periodStart).toBe("2026-08-31"),
    );
    await replaceField(user, "Period start", "2026-08-03");
    expect(screen.getByLabelText("Period start")).toHaveValue("2026-08-03");
  });

  it("uses the previous item's edited end and changes only the active item's calculations", async () => {
    setUpWorkspace(null, [completeIssuedInvoice]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-08-03");
    await replaceField(user, "Period end", "2026-08-12");
    await replaceField(user, "Billable days", "6.5");
    await user.click(screen.getByRole("button", { name: "+ Add item" }));

    const secondStart = screen.getAllByLabelText("Period start")[1];
    if (!secondStart) throw new Error("Expected a second invoice item");
    await user.click(secondStart);
    expect(secondStart).toHaveValue("2026-08-17");
    expect(screen.getAllByLabelText("Period end")[1]).toHaveValue("2026-08-23");
    expect(screen.getAllByLabelText("Billable days")[1]).toHaveValue("5");
    fireEvent.change(secondStart, { target: { value: "2026-08-19" } });
    expect(screen.getAllByLabelText("Billable days")[1]).toHaveValue("3");
    expect(screen.getAllByLabelText("Period end")[0]).toHaveValue("2026-08-12");
    expect(screen.getAllByLabelText("Billable days")[0]).toHaveValue("6.5");
  });

  it("preserves a recovered draft's custom dates and billable days on focus", async () => {
    setUpWorkspace({
      ...completeInvoiceDraftInput,
      serviceLines: [{ ...completeInvoiceDraftInput.serviceLines[0], billableDays: "2.5" }],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Resume draft" }));
    await user.click(screen.getByRole("tab", { name: "Work" }));
    await user.click(screen.getByLabelText("Period start"));
    expect(screen.getByLabelText("Period start")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("Period end")).toHaveValue("2026-09-04");
    expect(screen.getByLabelText("Billable days")).toHaveValue("2.5");
  });

  it("keeps an untouched new item when an earlier autosave finishes", async () => {
    const savedDrafts = setUpWorkspace();
    const firstSave = deferred<InvoiceDraftSaveResult>();
    window.invoiceApp = {
      ...window.invoiceApp,
      saveInvoiceDraft: async (input) => {
        savedDrafts.push(input);
        return savedDrafts.length === 1
          ? firstSave.promise
          : { kind: "saved", draft: persistedInvoiceDraftSchema.parse(input) };
      },
    };
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-08-03");
    await waitFor(() => expect(savedDrafts).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "+ Add item" }));
    const firstInput = savedDrafts[0];
    if (!firstInput) throw new Error("Expected the first pending save");
    await act(async () => {
      firstSave.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(firstInput) });
    });
    await waitFor(() => expect(savedDrafts.at(-1)?.serviceLines).toHaveLength(2));
    expect(await screen.findByText("Saved on this Mac")).toBeVisible();
    expect(screen.getAllByLabelText("Period start")).toHaveLength(2);
  });
});

function setUpWorkspace(draft: InvoiceDraftInput | null = null, invoices: IssuedInvoice[] = []) {
  const savedDrafts: InvoiceDraftInput[] = [];
  window.invoiceApp = {
    ...unusedInvoiceAppCommands,
    loadWorkspace: async () => ({
      kind: "ready",
      workspace: {
        appVersion: "0.1.0",
        clients: [completeClient],
        currentBusinessDate: businessDate,
        creditNotes: [],
        draft: draft ? { kind: "ordinary", draft: persistedInvoiceDraftSchema.parse(draft) } : null,
        issuedInvoices: invoices,
        issuer: completeIssuer,
      },
    }),
    saveInvoiceDraft: async (input) => {
      savedDrafts.push(input);
      return { kind: "saved", draft: persistedInvoiceDraftSchema.parse(input) };
    },
  };
  return savedDrafts;
}
