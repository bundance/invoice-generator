import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type {
  InvoiceAppBridge,
  InvoiceDraftSaveResult,
  InvoiceIssueReviewResult,
  InvoiceIssueResult,
} from "../../../application/invoice-application-contract.ts";
import { persistedClientSchema } from "../../../domain/clients/client.ts";
import {
  createInvoiceDraft,
  persistedInvoiceDraftSchema,
  reviewInvoiceDraft,
  type InvoiceDraftInput,
} from "../../../domain/invoices/invoice-draft.ts";
import { completeClient, completeGbpVatClient } from "../../../../tests/fixtures/client.ts";
import { completeIssuedInvoice } from "../../../../tests/fixtures/issued-invoice.ts";
import { completeIssuer } from "../../../../tests/fixtures/issuer-settings.ts";
import App from "../../app/app.tsx";
import {
  businessDate,
  deferred,
  makeOtherClient,
  replaceField,
  renderAppForTest,
  testInvoiceAppCommands,
} from "../../app/app-test-support.ts";

describe("outside-scope invoice draft", () => {
  afterEach(cleanup);

  it("keeps invoice review unavailable until the generated PDF is rendered", async () => {
    window.invoiceApp = readyDraftBridge();
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await user.type(screen.getByLabelText("Notes"), "Work in progress");
    expect(screen.getByRole("button", { name: "Review and issue" })).toBeDisabled();
    expect(screen.getByText("Preparing generated PDF…")).toBeVisible();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review and issue" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("Notes")).toHaveValue("Work in progress");
  });

  it("autosaves editable client defaults while refreshing the generated PDF", async () => {
    const savedDrafts: InvoiceDraftInput[] = [];
    window.invoiceApp = {
      ...testInvoiceAppCommands,
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
      saveInvoiceDraft: (draft) => {
        savedDrafts.push(draft);
        return Promise.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) });
      },
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    expect(await screen.findByRole("combobox", { name: "Client" })).toHaveValue(completeClient.id);
    expect(screen.getByLabelText("Client legal name")).toHaveValue(completeClient.legalName);
    await user.click(screen.getByRole("tab", { name: "Work" }));
    expect(screen.getByLabelText("Service description")).toHaveValue(
      completeClient.defaultServiceDescription,
    );
    expect(screen.getByLabelText("Day rate")).toHaveValue("725");
    expect(await screen.findByLabelText("Rendered PDF pages")).toBeVisible();

    await replaceField(user, "Period start", "2026-09-01");
    await replaceField(user, "Period end", "2026-09-05");
    await replaceField(user, "Billable days", "5");
    expect(screen.getByText("Saving")).toBeVisible();
    expect(screen.getByRole("button", { name: /React Native consultancy/ })).toHaveTextContent(
      "USD 3,625.00",
    );

    await waitFor(() => expect(savedDrafts).not.toHaveLength(0));
    expect(await screen.findByText("Saved on this Mac")).toBeVisible();
    expect(savedDrafts.at(-1)).toMatchObject({
      currencyCode: "USD",
      serviceLines: [
        {
          billableDays: "5",
          dayRate: "725",
          serviceDescription: completeClient.defaultServiceDescription,
        },
      ],
    });
    expect(savedDrafts.at(-1)).not.toHaveProperty("invoiceId");
  });

  it("adds, duplicates, deletes, and autosaves ordered invoice items", async () => {
    const savedDrafts: InvoiceDraftInput[] = [];
    window.invoiceApp = {
      ...readyDraftBridge(),
      saveInvoiceDraft: (draft) => {
        savedDrafts.push(draft);
        return Promise.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) });
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    expect(screen.getByRole("button", { name: "Delete item 1" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "+ Add item" }));

    expect(screen.getByText("2 items")).toBeVisible();
    const descriptions = screen.getAllByLabelText("Service description");
    const secondDescription = descriptions[1];
    if (!secondDescription) throw new Error("Expected a second service description");
    await user.clear(secondDescription);
    await user.type(secondDescription, "Architecture workshop");

    await waitFor(() =>
      expect(savedDrafts.at(-1)?.serviceLines[1]?.serviceDescription).toBe("Architecture workshop"),
    );
    expect(screen.getByRole("button", { name: /2.*Architecture workshop/s })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    const billableDays = screen.getAllByLabelText("Billable days")[1];
    if (!billableDays) throw new Error("Expected second-item billable days");
    await user.type(billableDays, "2");

    await user.click(screen.getByRole("button", { name: "Duplicate item" }));
    expect(screen.getByText("3 items")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete item 3" }));
    expect(screen.getByText("2 items")).toBeVisible();

    await waitFor(() =>
      expect(savedDrafts.at(-1)?.serviceLines[1]).toMatchObject({
        billableDays: "2",
        serviceDescription: "Architecture workshop",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Delete item 2" }));
    expect(screen.getByRole("button", { name: "Delete item 1" })).toBeDisabled();
  });

  it("keeps unsaved draft edits available and retries the latest input after a write failure", async () => {
    const savedDrafts: InvoiceDraftInput[] = [];
    let writeShouldFail = true;
    window.invoiceApp = {
      ...readyDraftBridge(),
      saveInvoiceDraft: (draft) => {
        savedDrafts.push(draft);
        return Promise.resolve(
          writeShouldFail
            ? { kind: "failed", message: "The draft could not be saved." }
            : { kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) },
        );
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await user.type(screen.getByLabelText("Notes"), "Keep this local edit");

    expect(
      await screen.findByText("Could not save draft. Your edits are still here."),
    ).toBeVisible();
    expect(screen.getByLabelText("Notes")).toHaveValue("Keep this local edit");

    await user.type(screen.getByLabelText("Notes"), " and the newer edit");
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    expect(savedDrafts).toHaveLength(1);

    writeShouldFail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Saved on this Mac")).toBeVisible();
    expect(savedDrafts.at(-1)?.notes).toBe("Keep this local edit and the newer edit");
  });

  it("keeps a recovered draft valid when the client's saved VAT treatment changes", async () => {
    const recoveredDraft = persistedInvoiceDraftSchema.parse({
      ...createInvoiceDraft(completeClient),
      notes: "Recovered notes",
    });
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            currentBusinessDate: businessDate,
            draft: { kind: "ordinary", draft: recoveredDraft },
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveInvoiceDraft: () =>
        Promise.resolve({ kind: "failed", message: "The draft could not be saved." }),
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
      updateClient: (_clientId, input) =>
        Promise.resolve({
          kind: "saved",
          client: persistedClientSchema.parse({
            ...completeClient,
            paymentTerms: input.paymentTerms,
            vatTreatment: completeGbpVatClient.vatTreatment,
          }),
        }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    const recoveryDialog = await screen.findByRole("dialog", {
      name: "Resume your invoice draft?",
    });
    await user.click(within(recoveryDialog).getByRole("button", { name: "Resume draft" }));
    await user.click(screen.getByRole("tab", { name: "Work" }));
    expect(screen.getByLabelText("Notes")).toHaveValue("Recovered notes");
    await user.type(screen.getByLabelText("Notes"), " with local edits");
    expect(
      await screen.findByText("Could not save draft. Your edits are still here."),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clients" }));
    await replaceField(user, "Payment terms", "Due on receipt");
    await user.selectOptions(screen.getByLabelText("VAT treatment"), "uk-taxable");
    await replaceField(user, "Default VAT rate", "20");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Client saved on this Mac")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create invoice" }));
    await user.click(screen.getByRole("tab", { name: "Work" }));

    expect(screen.getByLabelText("Notes")).toHaveValue("Recovered notes with local edits");
    expect(screen.getByLabelText("Payment terms")).toHaveValue(completeClient.paymentTerms);
    await user.click(screen.getByRole("button", { name: "+ Add item" }));
    expect(screen.getAllByLabelText("Service description")).toHaveLength(2);
    expect(screen.queryByLabelText("VAT rate")).toBeNull();
  });

  it("shows field and summary errors, keeps review available, and treats a late issue date as a warning", async () => {
    window.invoiceApp = readyDraftBridge();
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Day rate", "not-a-number");
    await user.tab();
    expect(screen.getByText("Enter a positive amount.")).toBeVisible();
    await screen.findByLabelText("Rendered PDF pages");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review and issue" })).toBeEnabled(),
    );

    await replaceField(user, "Period start", "2026-09-04");
    await replaceField(user, "Period end", "2026-09-04");
    await replaceField(user, "Billable days", "1");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await user.click(screen.getByRole("tab", { name: "Work" }));

    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));
    const summary = screen.getByRole("alert");
    expect(within(summary).getByText(/Fix \d+ detail/)).toBeVisible();
    expect(screen.getByLabelText("Day rate")).toHaveFocus();
    expect(screen.getByRole("button", { name: /React Native consultancy/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await replaceField(user, "Period start", "2026-08-01");
    expect(screen.getByLabelText("Period start")).toHaveFocus();
    await replaceField(user, "Period end", "2026-08-01");
    await replaceField(user, "Billable days", "1");
    await replaceField(user, "Day rate", "725");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));

    expect(
      screen.getByText(
        "The issue date is more than 14 days after the latest service period. Check the tax point before issue.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Draft is valid and ready for final issue review. No number has been consumed.",
      ),
    ).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Work" }));
    await replaceField(user, "Day rate", "726");
    expect(
      screen.queryByText(
        "Draft is valid and ready for final issue review. No number has been consumed.",
      ),
    ).toBeNull();
  });

  it("shows fresh issue facts and cancels without issuing or losing trigger focus", async () => {
    let issueCount = 0;
    window.invoiceApp = {
      ...readyDraftBridge(),
      issueInvoice: () => {
        issueCount += 1;
        return Promise.reject(new Error("Issue must not run after cancellation"));
      },
      reviewInvoiceIssue: (draft) => {
        const review = reviewInvoiceDraft({
          client: completeClient,
          draft,
          issuer: completeIssuer,
          today: businessDate,
        });
        if (!review.candidate) {
          return Promise.resolve({ kind: "invalid", message: "The draft is invalid." });
        }
        return Promise.resolve({
          kind: "ready",
          candidate: review.candidate,
          warnings: review.warnings,
        });
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-09-01");
    await replaceField(user, "Period end", "2026-09-04");
    await replaceField(user, "Billable days", "4");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await waitForGeneratedPdfPreview();
    const trigger = screen.getByRole("button", { name: "Review and issue" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Issue invoice GGIOHK-0043?" });
    expect(within(dialog).getByText("Genesis Global")).toBeVisible();
    expect(within(dialog).getByText(/2026-09-01 to 2026-09-04/)).toBeVisible();
    expect(within(dialog).getByText("Net")).toBeVisible();
    expect(within(dialog).getByText("VAT")).toBeVisible();
    expect(within(dialog).getByText("Gross")).toBeVisible();
    expect(within(dialog).getAllByText("USD 2,900.00")).toHaveLength(2);
    expect(within(dialog).getByText("USD 0.00")).toBeVisible();
    expect(within(dialog).getByText("Outside the scope of UK VAT")).toBeVisible();
    expect(within(dialog).getByText(/cannot be edited or deleted/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Keep editing" })).toHaveFocus();

    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "Issue invoice GGIOHK-0043?" })).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(issueCount).toBe(0);
  });

  it("freezes the reviewed draft while the final review is being prepared", async () => {
    const pendingReview = deferred<InvoiceIssueReviewResult>();
    let issuedDraft: InvoiceDraftInput | undefined;
    window.invoiceApp = {
      ...readyDraftBridge(),
      issueInvoice: (input) => {
        issuedDraft = input.draft;
        return Promise.resolve({
          kind: "issued",
          client: persistedClientSchema.parse({
            ...completeClient,
            invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
          }),
          invoice: completeIssuedInvoice,
        });
      },
      reviewInvoiceIssue: () => pendingReview.promise,
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-09-01");
    await replaceField(user, "Period end", "2026-09-04");
    await replaceField(user, "Billable days", "4");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));

    await user.click(screen.getByRole("tab", { name: "Work" }));
    expect(screen.getByLabelText("Day rate")).toBeDisabled();

    const reviewDraft = createInvoiceDraft(completeClient);
    if (reviewDraft.vatTreatment !== "outside-scope") {
      throw new Error("Expected outside-scope draft");
    }
    const review = reviewInvoiceDraft({
      client: completeClient,
      draft: {
        ...reviewDraft,
        issueDate: "2026-09-04",
        serviceLines: [
          {
            ...reviewDraft.serviceLines[0],
            billableDays: "4",
            periodEnd: "2026-09-04",
            periodStart: "2026-09-01",
          },
        ],
      },
      issuer: completeIssuer,
      today: businessDate,
    });
    if (!review.candidate) throw new Error("Expected a valid invoice review candidate");
    pendingReview.resolve({
      kind: "ready",
      candidate: review.candidate,
      warnings: review.warnings,
    });

    const dialog = await screen.findByRole("dialog", { name: "Issue invoice GGIOHK-0043?" });
    await user.click(within(dialog).getByRole("button", { name: "Issue GGIOHK-0043" }));
    await waitFor(() => expect(issuedDraft?.serviceLines[0]?.dayRate).toBe("725"));
  });

  it("drains the latest autosave before review and does not save behind an issue", async () => {
    const mutationOrder: string[] = [];
    const pendingIssue = deferred<InvoiceIssueResult>();
    window.invoiceApp = {
      ...readyDraftBridge(),
      issueInvoice: () => {
        mutationOrder.push("issue");
        return pendingIssue.promise;
      },
      reviewInvoiceIssue: (draft) => {
        mutationOrder.push("review");
        const review = reviewInvoiceDraft({
          client: completeClient,
          draft,
          issuer: completeIssuer,
          today: businessDate,
        });
        if (!review.candidate) {
          return Promise.resolve({ kind: "invalid", message: "The draft is invalid." });
        }
        return Promise.resolve({ kind: "ready", candidate: review.candidate, warnings: [] });
      },
      saveInvoiceDraft: (draft) => {
        mutationOrder.push(`save:${draft.notes}`);
        return Promise.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) });
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-09-01");
    await replaceField(user, "Period end", "2026-09-04");
    await replaceField(user, "Billable days", "4");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await screen.findByText("Saved on this Mac");
    mutationOrder.length = 0;

    await user.click(screen.getByRole("tab", { name: "Work" }));
    await user.type(screen.getByLabelText("Notes"), "Latest note");
    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));
    const dialog = await screen.findByRole("dialog", { name: "Issue invoice GGIOHK-0043?" });
    await user.click(within(dialog).getByRole("button", { name: "Issue GGIOHK-0043" }));
    await new Promise((resolve) => window.setTimeout(resolve, 400));

    expect(mutationOrder).toEqual(["save:Latest note", "review", "issue"]);
    pendingIssue.resolve({
      kind: "issued",
      client: persistedClientSchema.parse({
        ...completeClient,
        invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
      }),
      invoice: completeIssuedInvoice,
    });
  });

  it("stops before final review when the latest draft cannot be saved", async () => {
    let reviewCount = 0;
    let saveCount = 0;
    window.invoiceApp = {
      ...readyDraftBridge(),
      reviewInvoiceIssue: () => {
        reviewCount += 1;
        return Promise.reject(new Error("Review must not run for an unsaved draft"));
      },
      saveInvoiceDraft: () => {
        saveCount += 1;
        return Promise.resolve({ kind: "failed", message: "The draft could not be saved." });
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-09-01");
    await replaceField(user, "Period end", "2026-09-04");
    await replaceField(user, "Billable days", "4");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await screen.findByText("Could not save draft. Your edits are still here.");
    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));

    expect(
      await screen.findByText("Save the latest draft before preparing the final issue review."),
    ).toBeVisible();
    expect(saveCount).toBe(2);
    expect(reviewCount).toBe(0);
  });

  it("retries one failed autosave before opening the final issue review", async () => {
    let reviewCount = 0;
    let saveCount = 0;
    window.invoiceApp = {
      ...readyDraftBridge(),
      reviewInvoiceIssue: (draft) => {
        reviewCount += 1;
        const review = reviewInvoiceDraft({
          client: completeClient,
          draft,
          issuer: completeIssuer,
          today: businessDate,
        });
        if (!review.candidate) {
          return Promise.resolve({ kind: "invalid", message: "The draft is invalid." });
        }
        return Promise.resolve({ kind: "ready", candidate: review.candidate, warnings: [] });
      },
      saveInvoiceDraft: (draft) => {
        saveCount += 1;
        return Promise.resolve(
          saveCount === 1
            ? { kind: "failed", message: "The draft could not be saved." }
            : { kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) },
        );
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-09-01");
    await replaceField(user, "Period end", "2026-09-04");
    await replaceField(user, "Billable days", "4");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await screen.findByText("Could not save draft. Your edits are still here.");
    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));

    expect(await screen.findByRole("dialog", { name: "Issue invoice GGIOHK-0043?" })).toBeVisible();
    expect(saveCount).toBe(2);
    expect(reviewCount).toBe(1);
  });

  it("retries an autosave that fails after final review has already started", async () => {
    const firstSave = deferred<InvoiceDraftSaveResult>();
    let reviewCount = 0;
    let saveCount = 0;
    window.invoiceApp = {
      ...readyDraftBridge(),
      reviewInvoiceIssue: (draft) => {
        reviewCount += 1;
        const review = reviewInvoiceDraft({
          client: completeClient,
          draft,
          issuer: completeIssuer,
          today: businessDate,
        });
        if (!review.candidate) {
          return Promise.resolve({ kind: "invalid", message: "The draft is invalid." });
        }
        return Promise.resolve({ kind: "ready", candidate: review.candidate, warnings: [] });
      },
      saveInvoiceDraft: (draft) => {
        saveCount += 1;
        return saveCount === 1
          ? firstSave.promise
          : Promise.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) });
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await user.type(screen.getByLabelText("Notes"), "Latest note");
    await waitFor(() => expect(saveCount).toBe(1));
    await replaceField(user, "Period start", "2026-09-01");
    await replaceField(user, "Period end", "2026-09-04");
    await replaceField(user, "Billable days", "4");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));

    firstSave.resolve({ kind: "failed", message: "The draft could not be saved." });

    await waitFor(() => expect(saveCount).toBe(2));
    await waitFor(() => expect(reviewCount).toBe(1));
    expect(await screen.findByRole("dialog", { name: "Issue invoice GGIOHK-0043?" })).toBeVisible();
  });

  it("requires the late-date acknowledgement, issues, and moves the immutable invoice to history", async () => {
    let acknowledgement: boolean | undefined;
    const issuedClient = persistedClientSchema.parse({
      ...completeClient,
      invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
    });
    window.invoiceApp = {
      ...readyDraftBridge(),
      issueInvoice: (input) => {
        acknowledgement = input.lateIssueDateAcknowledged;
        return Promise.resolve({
          kind: "issued",
          client: issuedClient,
          invoice: completeIssuedInvoice,
        });
      },
      reviewInvoiceIssue: (draft) => {
        const review = reviewInvoiceDraft({
          client: completeClient,
          draft,
          issuer: completeIssuer,
          today: businessDate,
        });
        if (!review.candidate) {
          return Promise.resolve({ kind: "invalid", message: "The draft is invalid." });
        }
        return Promise.resolve({
          kind: "ready",
          candidate: review.candidate,
          warnings: review.warnings,
        });
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-08-01");
    await replaceField(user, "Period end", "2026-08-01");
    await replaceField(user, "Billable days", "1");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));

    const dialog = await screen.findByRole("dialog", { name: "Issue invoice GGIOHK-0043?" });
    const issueButton = within(dialog).getByRole("button", { name: "Issue GGIOHK-0043" });
    expect(issueButton).toBeDisabled();
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "I checked the tax point for this late issue date.",
      }),
    );
    expect(issueButton).toBeEnabled();
    await user.click(issueButton);

    expect(await screen.findByRole("article", { name: "Invoice GGIOHK-0043" })).toBeVisible();
    expect(acknowledgement).toBe(true);
  });

  it("does not dismiss an issue that is already committing when Escape is pressed", async () => {
    const pendingIssue = deferred<InvoiceIssueResult>();
    window.invoiceApp = {
      ...readyDraftBridge(),
      issueInvoice: () => pendingIssue.promise,
      reviewInvoiceIssue: (draft) => {
        const review = reviewInvoiceDraft({
          client: completeClient,
          draft,
          issuer: completeIssuer,
          today: businessDate,
        });
        if (!review.candidate) {
          return Promise.resolve({ kind: "invalid", message: "The draft is invalid." });
        }
        return Promise.resolve({
          kind: "ready",
          candidate: review.candidate,
          warnings: review.warnings,
        });
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await replaceField(user, "Period start", "2026-09-01");
    await replaceField(user, "Period end", "2026-09-04");
    await replaceField(user, "Billable days", "4");
    await user.click(screen.getByRole("tab", { name: "Tax & issue" }));
    await replaceField(user, "Issue date", "2026-09-04");
    await waitForGeneratedPdfPreview();
    await user.click(screen.getByRole("button", { name: "Review and issue" }));

    const dialog = await screen.findByRole("dialog", { name: "Issue invoice GGIOHK-0043?" });
    await user.click(within(dialog).getByRole("button", { name: "Issue GGIOHK-0043" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Issuing…" })).toBeDisabled();

    pendingIssue.resolve({
      kind: "issued",
      client: persistedClientSchema.parse({
        ...completeClient,
        invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
      }),
      invoice: completeIssuedInvoice,
    });
    expect(await screen.findByRole("article", { name: "Invoice GGIOHK-0043" })).toBeVisible();
  });

  it("offers resume or discard after restart and clears the recovered draft without saving a replacement", async () => {
    const baseRecoveredDraft = createInvoiceDraft(completeClient);
    const recoveredDraft = persistedInvoiceDraftSchema.parse({
      ...baseRecoveredDraft,
      notes: "Recovered notes",
      serviceLines: [{ ...baseRecoveredDraft.serviceLines[0], billableDays: "3.5" }],
    });
    let discardCount = 0;
    let saveCount = 0;
    window.invoiceApp = {
      ...testInvoiceAppCommands,
      discardInvoiceDraft: () => {
        discardCount += 1;
        return Promise.resolve({ kind: "discarded" });
      },
      loadWorkspace: () =>
        Promise.resolve({
          kind: "ready",
          workspace: {
            appVersion: "0.1.0",
            clients: [completeClient],
            currentBusinessDate: businessDate,
            draft: { kind: "ordinary", draft: recoveredDraft },
            creditNotes: [],
            issuedInvoices: [],
            issuer: completeIssuer,
          },
        }),
      saveInvoiceDraft: (draft) => {
        saveCount += 1;
        return Promise.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) });
      },
      saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    const dialog = await screen.findByRole("dialog", { name: "Resume your invoice draft?" });
    expect(within(dialog).getByRole("button", { name: "Resume draft" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Discard recovered draft" }));

    await waitFor(() => expect(discardCount).toBe(1));
    expect(screen.queryByRole("dialog", { name: "Resume your invoice draft?" })).toBeNull();
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    expect(saveCount).toBe(0);
    expect(screen.getByText("Not saved yet")).toBeVisible();
  });

  it("does not restore an in-flight autosave after the draft is discarded", async () => {
    const pendingSave = deferred<InvoiceDraftSaveResult>();
    let inputBeingSaved: InvoiceDraftInput | undefined;
    let discardCount = 0;
    window.invoiceApp = {
      ...readyDraftBridge(),
      discardInvoiceDraft: () => {
        discardCount += 1;
        return Promise.resolve({ kind: "discarded" });
      },
      saveInvoiceDraft: (draft) => {
        inputBeingSaved = draft;
        return pendingSave.promise;
      },
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    await user.click(await screen.findByRole("tab", { name: "Work" }));
    await user.type(screen.getByLabelText("Notes"), "Discard while saving");
    await waitFor(() => expect(inputBeingSaved).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Discard draft" }));

    await waitFor(() => expect(discardCount).toBe(1));
    expect(screen.getByLabelText("Notes")).toHaveValue("");
    expect(screen.getByText("Not saved yet")).toBeVisible();
    if (!inputBeingSaved) throw new Error("Expected an in-flight draft save");
    pendingSave.resolve({
      kind: "saved",
      draft: persistedInvoiceDraftSchema.parse(inputBeingSaved),
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(screen.getByText("Not saved yet")).toBeVisible();
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });

  it("confirms before replacing edited facts with another client's defaults", async () => {
    const otherClient = makeOtherClient();
    window.invoiceApp = {
      ...readyDraftBridge(),
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
    };
    const user = userEvent.setup();
    renderAppForTest(<App />);

    const clientSelect = await screen.findByRole("combobox", { name: "Client" });
    await replaceField(user, "Client legal name", "Edited client name");
    await user.selectOptions(clientSelect, otherClient.id);

    const dialog = screen.getByRole("dialog", {
      name: "Change this draft to Acme Research Ltd?",
    });
    expect(within(dialog).getByRole("button", { name: "Keep editing" })).toHaveFocus();
    expect(clientSelect).toHaveValue(completeClient.id);
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Client legal name")).toHaveValue("Edited client name");

    await user.selectOptions(clientSelect, otherClient.id);
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Change this draft to Acme Research Ltd?" }),
      ).getByRole("button", { name: "Replace draft details" }),
    );

    expect(clientSelect).toHaveValue(otherClient.id);
    expect(screen.getByLabelText("Client legal name")).toHaveValue(otherClient.legalName);
    expect(screen.getByLabelText("Currency")).toHaveValue("GBP");
  });
});

function readyDraftBridge(): InvoiceAppBridge {
  return {
    ...testInvoiceAppCommands,
    discardInvoiceDraft: () => Promise.resolve({ kind: "discarded" }),
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
    saveInvoiceDraft: (draft) =>
      Promise.resolve({ kind: "saved", draft: persistedInvoiceDraftSchema.parse(draft) }),
    saveIssuerSettings: () => Promise.resolve({ kind: "saved", issuer: completeIssuer }),
  };
}

async function waitForGeneratedPdfPreview(): Promise<void> {
  await screen.findByLabelText("Rendered PDF pages");
}
