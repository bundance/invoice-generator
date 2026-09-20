import { describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../domain/clients/client.js";
import { persistedInvoiceDraftSchema } from "../domain/invoices/invoice-draft.js";
import { parseBusinessDate } from "../domain/time/business-date.js";
import { completeClient } from "../../tests/fixtures/client.js";
import {
  completeCreditNote,
  completeInvoiceDraftInput,
  completeIssuedInvoice,
} from "../../tests/fixtures/issued-invoice.js";
import { completeIssuer } from "../../tests/fixtures/issuer-settings.js";
import { openInvoiceApplication } from "./invoice-application.js";
import { unusedDatasetArchive } from "./application-test-support.js";
import {
  initialWorkspaceState,
  type InvoicePdf,
  type WorkspaceRepository,
  type WorkspaceState,
} from "./workspace.js";

describe("replacement application", () => {
  it("creates one recoverable linked draft without changing history or consuming a number", async () => {
    const originalState = creditedWorkspace();
    const repository = memoryRepository(originalState);
    const application = await openReplacementApplication(repository);

    await expect(
      application.createReplacementDraft(completeIssuedInvoice.id),
    ).resolves.toMatchObject({
      kind: "created",
      draft: {
        clientId: completeClient.id,
        issueDate: "",
        serviceLines: [
          {
            serviceDescription: completeIssuedInvoice.serviceLines[0]?.serviceDescription,
          },
        ],
      },
      source: completeIssuedInvoice.id,
    });

    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        clients: [{ invoiceSequence: { nextNumber: "44" } }],
        creditNotes: [completeCreditNote],
        issuedInvoices: [completeIssuedInvoice],
        draft: {
          kind: "replacement",
          source: completeIssuedInvoice.id,
        },
      },
    });
    expect(repository.currentState()).toMatchObject({
      creditNotes: [completeCreditNote],
      issuedInvoices: [completeIssuedInvoice],
    });
  });

  it("does not overwrite an existing draft and keeps creation failure recoverable", async () => {
    const existingDraft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const repository = memoryRepository({
      ...creditedWorkspace(),
      draft: { kind: "ordinary", draft: existingDraft },
    });
    const application = await openReplacementApplication(repository);

    await expect(application.createReplacementDraft(completeIssuedInvoice.id)).resolves.toEqual({
      kind: "conflict",
      message: "Keep or discard the current invoice draft before creating a replacement.",
    });
    expect(repository.currentState().draft).toEqual(repository.initialState().draft);
  });

  it("atomically replaces an existing draft in one save", async () => {
    const existingDraft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const originalState = {
      ...creditedWorkspace(),
      draft: { kind: "ordinary", draft: existingDraft } as const,
    };
    const memory = memoryRepository(originalState);
    let saveCount = 0;
    const repository: WorkspaceRepository = {
      ...memory,
      save: (state) => {
        saveCount += 1;
        return memory.save(state);
      },
    };
    const application = await openReplacementApplication(repository);

    await expect(
      application.replaceDraftWithReplacement(completeIssuedInvoice.id),
    ).resolves.toMatchObject({ kind: "created" });
    expect(saveCount).toBe(1);
    expect(memory.currentState().draft).toMatchObject({
      kind: "replacement",
      source: completeIssuedInvoice.id,
    });
  });

  it("keeps the existing draft when its atomic replacement cannot be saved", async () => {
    const existingDraft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const originalState = {
      ...creditedWorkspace(),
      draft: { kind: "ordinary", draft: existingDraft } as const,
    };
    const memory = memoryRepository(originalState);
    const application = await openReplacementApplication({
      ...memory,
      save: () => Promise.reject(new Error("Disk unavailable")),
    });

    await expect(
      application.replaceDraftWithReplacement(completeIssuedInvoice.id),
    ).resolves.toMatchObject({ kind: "failed" });
    expect(memory.currentState()).toEqual(originalState);
  });

  it("issues a linked replacement once with the client's current next number", async () => {
    const repository = memoryRepository(creditedWorkspace());
    const application = await openReplacementApplication(repository, successfulInvoicePdf);
    const creation = await application.createReplacementDraft(completeIssuedInvoice.id);
    if (creation.kind !== "created") throw new Error("Expected a replacement draft");
    const draft = { ...creation.draft, issueDate: "2026-09-08" };
    await application.saveInvoiceDraft(draft);
    const review = await application.reviewInvoiceIssue(draft);
    if (review.kind !== "ready") throw new Error("Expected a ready replacement review");
    expect(review.candidate.proposedInvoiceId).toBe("GGIOHK-0044");

    const issueInput = {
      draft,
      expectedInvoiceId: review.candidate.proposedInvoiceId,
      lateIssueDateAcknowledged: false,
    };
    const results = await Promise.all([
      application.issueInvoice(issueInput),
      application.issueInvoice(issueInput),
    ]);

    expect(results).toMatchObject([
      {
        kind: "issued",
        invoice: { id: "GGIOHK-0044", replacesInvoiceId: "GGIOHK-0043" },
      },
      { kind: "invalid" },
    ]);
    expect(repository.currentState()).toMatchObject({
      clients: [{ invoiceSequence: { nextNumber: "45" } }],
      creditNotes: [completeCreditNote],
      draft: null,
      issuedInvoices: [completeIssuedInvoice, { id: "GGIOHK-0044" }],
    });
  });

  it("keeps the correction link when the editable replacement selects another client", async () => {
    const otherClient = persistedClientSchema.parse({
      ...completeClient,
      id: "747253f4-113c-4d84-8381-c219776b7469",
      invoiceSequence: { nextNumber: "7", prefix: "OTHER" },
      legalName: "Other Client Ltd",
    });
    const repository = memoryRepository({
      ...creditedWorkspace(),
      clients: [creditedWorkspace().clients[0]!, otherClient],
    });
    const application = await openReplacementApplication(repository, successfulInvoicePdf);
    const creation = await application.createReplacementDraft(completeIssuedInvoice.id);
    if (creation.kind !== "created") throw new Error("Expected a replacement draft");
    const draft = {
      ...creation.draft,
      clientId: otherClient.id,
      clientLegalName: otherClient.legalName,
      clientPostalAddress: otherClient.postalAddress,
      issueDate: "2026-09-08",
    };
    await application.saveInvoiceDraft(draft);
    const review = await application.reviewInvoiceIssue(draft);
    if (review.kind !== "ready") throw new Error("Expected a ready replacement review");

    await expect(
      application.issueInvoice({
        draft,
        expectedInvoiceId: review.candidate.proposedInvoiceId,
        lateIssueDateAcknowledged: false,
      }),
    ).resolves.toMatchObject({
      kind: "issued",
      client: { id: otherClient.id, invoiceSequence: { nextNumber: "8" } },
      invoice: {
        client: { id: otherClient.id },
        id: "OTHER-0007",
        replacesInvoiceId: completeIssuedInvoice.id,
      },
    });
    expect(repository.currentState().clients).toMatchObject([
      { invoiceSequence: { nextNumber: "44" } },
      { invoiceSequence: { nextNumber: "8" } },
    ]);
  });

  it("keeps the linked draft and number when replacement PDF preparation fails", async () => {
    const repository = memoryRepository(creditedWorkspace());
    const application = await openReplacementApplication(repository);
    const creation = await application.createReplacementDraft(completeIssuedInvoice.id);
    if (creation.kind !== "created") throw new Error("Expected a replacement draft");
    const draft = { ...creation.draft, issueDate: "2026-09-08" };
    await application.saveInvoiceDraft(draft);
    const review = await application.reviewInvoiceIssue(draft);
    if (review.kind !== "ready") throw new Error("Expected a ready replacement review");

    await expect(
      application.issueInvoice({
        draft,
        expectedInvoiceId: review.candidate.proposedInvoiceId,
        lateIssueDateAcknowledged: false,
      }),
    ).resolves.toMatchObject({ kind: "failed" });
    expect(repository.currentState()).toMatchObject({
      clients: [{ invoiceSequence: { nextNumber: "44" } }],
      draft: {
        kind: "replacement",
        draft,
        source: creation.source,
      },
      issuedInvoices: [completeIssuedInvoice],
    });
  });
});

function creditedWorkspace(): WorkspaceState {
  return {
    ...initialWorkspaceState,
    clients: [
      persistedClientSchema.parse({
        ...completeClient,
        invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
      }),
    ],
    creditNotes: [completeCreditNote],
    issuedInvoices: [completeIssuedInvoice],
    issuer: completeIssuer,
  };
}

function memoryRepository(initialState: WorkspaceState): WorkspaceRepository & {
  currentState: () => WorkspaceState;
  initialState: () => WorkspaceState;
} {
  let state = initialState;
  return {
    commitRetainedDocument: (nextState) => {
      state = nextState;
      return Promise.resolve();
    },
    currentState: () => state,
    initialState: () => initialState,
    load: () => Promise.resolve(state),
    retainedPdfPath: () => Promise.resolve("/retained/document.pdf"),
    save: (nextState) => {
      state = nextState;
      return Promise.resolve();
    },
  };
}

const successfulInvoicePdf: InvoicePdf = {
  checkFit: () => Promise.resolve(true),
  prepare: (snapshot) =>
    Promise.resolve({
      bytes: new Uint8Array([37, 80, 68, 70]),
      pdf: { filename: `${snapshot.id}.pdf`, sha256: "f".repeat(64) },
    }),
};

function openReplacementApplication(
  workspaceRepository: WorkspaceRepository,
  invoicePdf: InvoicePdf = {
    checkFit: () => Promise.resolve(true),
    prepare: () => Promise.reject(new Error("Invoice PDF preparation failed")),
  },
) {
  return openInvoiceApplication({
    appVersion: "0.1.0",
    createClientId: () => completeClient.id,
    creditNotePdf: {
      checkFit: () => Promise.resolve(true),
      prepare: () => Promise.reject(new Error("Credit-note PDF is not used in this test")),
    },
    currentBusinessDate: () => parseBusinessDate("2026-09-08"),
    currentTimestamp: () => "2026-09-08T10:11:12.000Z",
    datasetArchive: unusedDatasetArchive,
    invoicePdf,
    workspaceRepository,
  });
}
