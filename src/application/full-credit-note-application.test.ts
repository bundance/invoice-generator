import { describe, expect, it } from "vite-plus/test";

import {
  reviewFullCreditNote,
  type FullCreditNoteCandidate,
} from "../domain/invoices/credit-note.js";
import { parseBusinessDate } from "../domain/time/business-date.js";
import { completeClient } from "../../tests/fixtures/client.js";
import { completeCreditNote, completeIssuedInvoice } from "../../tests/fixtures/issued-invoice.js";
import { openInvoiceApplication } from "./invoice-application.js";
import { unusedDatasetArchive } from "./application-test-support.js";
import {
  initialWorkspaceState,
  type WorkspaceRepository,
  type WorkspaceState,
} from "./workspace.js";

describe("full credit note application", () => {
  it("commits one canonical full credit without consuming either client sequence", async () => {
    let state: WorkspaceState = {
      ...initialWorkspaceState,
      clients: [completeClient],
      issuedInvoices: [completeIssuedInvoice],
    };
    const committedStates: WorkspaceState[] = [];
    const workspaceRepository: WorkspaceRepository = {
      commitRetainedDocument: (nextState) => {
        committedStates.push(nextState);
        state = nextState;
        return Promise.resolve();
      },
      load: () => Promise.resolve(state),
      retainedPdfPath: () => Promise.resolve("/retained/document.pdf"),
      save: (nextState) => {
        state = nextState;
        return Promise.resolve();
      },
    };
    const application = await openInvoiceApplication({
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      creditNotePdf: {
        checkFit: () => Promise.resolve(true),
        prepare: (snapshot) =>
          Promise.resolve({
            bytes: new Uint8Array([37, 80, 68, 70]),
            pdf: { filename: `${snapshot.id}.pdf`, sha256: "e".repeat(64) },
          }),
      },
      currentBusinessDate: () => parseBusinessDate("2026-09-07"),
      currentTimestamp: () => "2026-09-07T10:11:12.000Z",
      datasetArchive: unusedDatasetArchive,
      invoicePdf: unusedInvoicePdf,
      workspaceRepository,
    });
    const review = await application.reviewFullCreditNote(fullCreditNoteInput);
    expect(review).toMatchObject({
      kind: "ready",
      candidate: { id: "CN-GGIOHK-0043", totals: { gross: "-2900.00" } },
    });
    if (review.kind !== "ready") throw new Error("Expected a ready credit-note review");

    const results = await Promise.all([
      application.issueFullCreditNote({ candidate: review.candidate }),
      application.issueFullCreditNote({ candidate: review.candidate }),
    ]);

    expect(results).toMatchObject([
      {
        kind: "issued",
        creditNote: { id: "CN-GGIOHK-0043", originalInvoiceId: "GGIOHK-0043" },
      },
      { kind: "invalid" },
    ]);
    expect(committedStates).toHaveLength(1);
    expect(state).toMatchObject({
      clients: [completeClient],
      creditNotes: [{ id: "CN-GGIOHK-0043" }],
      issuedInvoices: [completeIssuedInvoice],
    });
  });

  it("rejects a second full credit before PDF preparation", async () => {
    let prepareCount = 0;
    const application = await openInvoiceApplication({
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      creditNotePdf: {
        checkFit: () => Promise.resolve(true),
        prepare: () => {
          prepareCount += 1;
          return Promise.reject(new Error("A second credit must not prepare a PDF"));
        },
      },
      currentBusinessDate: () => parseBusinessDate("2026-09-07"),
      currentTimestamp: () => "2026-09-07T10:11:12.000Z",
      datasetArchive: unusedDatasetArchive,
      invoicePdf: unusedInvoicePdf,
      workspaceRepository: memoryRepository({
        ...initialWorkspaceState,
        clients: [completeClient],
        creditNotes: [completeCreditNote],
        issuedInvoices: [completeIssuedInvoice],
      }),
    });

    await expect(
      application.issueFullCreditNote({ candidate: createFullCreditNoteCandidate() }),
    ).resolves.toEqual({
      kind: "invalid",
      message: "This invoice already has a full credit note.",
    });
    expect(prepareCount).toBe(0);
  });

  it("rejects bad debt during review before PDF preparation", async () => {
    let prepareCount = 0;
    const application = await openInvoiceApplication({
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      creditNotePdf: {
        checkFit: () => Promise.resolve(true),
        prepare: () => {
          prepareCount += 1;
          return Promise.reject(new Error("Bad debt must not prepare a credit-note PDF"));
        },
      },
      currentBusinessDate: () => parseBusinessDate("2026-09-07"),
      currentTimestamp: () => "2026-09-07T10:11:12.000Z",
      datasetArchive: unusedDatasetArchive,
      invoicePdf: unusedInvoicePdf,
      workspaceRepository: memoryRepository({
        ...initialWorkspaceState,
        clients: [completeClient],
        issuedInvoices: [completeIssuedInvoice],
      }),
    });

    await expect(
      application.reviewFullCreditNote({ ...fullCreditNoteInput, reason: "Bad debt" }),
    ).resolves.toEqual({
      kind: "invalid",
      message: "Enter a genuine correction reason. Bad debt is not a correction reason.",
    });
    expect(prepareCount).toBe(0);
  });

  it("keeps history and both client sequences when PDF preparation fails", async () => {
    const repository = memoryRepository({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuedInvoices: [completeIssuedInvoice],
    });
    const application = await openInvoiceApplication({
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      creditNotePdf: {
        checkFit: () => Promise.resolve(true),
        prepare: () => Promise.reject(new Error("PDF verification failed")),
      },
      currentBusinessDate: () => parseBusinessDate("2026-09-07"),
      currentTimestamp: () => "2026-09-07T10:11:12.000Z",
      datasetArchive: unusedDatasetArchive,
      invoicePdf: unusedInvoicePdf,
      workspaceRepository: repository,
    });

    await expect(
      application.issueFullCreditNote({ candidate: createFullCreditNoteCandidate() }),
    ).resolves.toEqual({
      kind: "failed",
      message: "The credit note was not issued. CN-GGIOHK-0043 was not used. Review and try again.",
    });
    await expect(application.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        clients: [{ invoiceSequence: { nextNumber: "43" } }],
        creditNotes: [],
        issuedInvoices: [completeIssuedInvoice],
      },
    });
  });
});

const fullCreditNoteInput = {
  issueDate: "2026-09-07",
  originalInvoiceId: completeIssuedInvoice.id,
  reason: "The billed service period was incorrect.",
} as const;

const unusedInvoicePdf = {
  checkFit: () => Promise.resolve(true),
  prepare: () => Promise.reject(new Error("Invoice PDF is not used in this test")),
} as const;

function createFullCreditNoteCandidate(): FullCreditNoteCandidate {
  const review = reviewFullCreditNote({
    input: fullCreditNoteInput,
    invoice: completeIssuedInvoice,
    today: parseBusinessDate("2026-09-07"),
  });
  if (review.kind !== "ready") throw new Error("Expected a ready credit-note fixture");
  return review.candidate;
}

function memoryRepository(initialState: WorkspaceState): WorkspaceRepository {
  let state = initialState;
  return {
    commitRetainedDocument: (nextState) => {
      state = nextState;
      return Promise.resolve();
    },
    load: () => Promise.resolve(state),
    retainedPdfPath: () => Promise.resolve("/retained/document.pdf"),
    save: (nextState) => {
      state = nextState;
      return Promise.resolve();
    },
  };
}
