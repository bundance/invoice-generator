import { describe, expect, it } from "vite-plus/test";

import { type ClientInput, persistedClientSchema } from "../domain/clients/client.js";
import {
  createInvoiceDraft,
  persistedInvoiceDraftSchema,
} from "../domain/invoices/invoice-draft.js";
import { parseIssuerSettingsInput } from "../domain/issuer/issuer-settings.js";
import { parseBusinessDate, type BusinessDate } from "../domain/time/business-date.js";
import {
  completeClient,
  completeClientInput,
  completeClientFields,
  completeGbpVatClient,
} from "../../tests/fixtures/client.js";
import { completeIssuer, completeIssuerInput } from "../../tests/fixtures/issuer-settings.js";
import {
  completeInvoiceDraftInput,
  completeIssuedInvoice,
  completeGbpVatInvoiceDraftInput,
} from "../../tests/fixtures/issued-invoice.js";
import {
  initialWorkspaceState,
  type WorkspaceRepository,
  type WorkspaceState,
} from "./workspace.js";
import { openInvoiceApplication } from "./invoice-application.js";
import { unusedDatasetArchive } from "./application-test-support.js";

describe("invoice application", () => {
  it("commits one GBP VAT issue and advances its client once under overlapping requests", async () => {
    const committedStates: WorkspaceState[] = [];
    const baseWorkspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      clients: [completeGbpVatClient],
      draft: {
        kind: "ordinary",
        draft: persistedInvoiceDraftSchema.parse(completeGbpVatInvoiceDraftInput),
      },
      issuer: completeIssuer,
    });
    const workspaceRepository: WorkspaceRepository = {
      ...baseWorkspaceRepository,
      commitRetainedDocument: (state) => {
        committedStates.push(state);
        return baseWorkspaceRepository.save(state);
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeGbpVatClient.id,
      currentBusinessDate: () => parseBusinessDate("2026-09-06"),
      currentTimestamp: () => "2026-09-06T10:11:12.000Z",
      invoicePdf: {
        checkFit: () => Promise.resolve(true),
        prepare: (snapshot) =>
          Promise.resolve({
            bytes: new Uint8Array([37, 80, 68, 70]),
            pdf: { filename: `${snapshot.id}.pdf`, sha256: "c".repeat(64) },
          }),
      },
      workspaceRepository,
    });
    const issueInput = {
      draft: completeGbpVatInvoiceDraftInput,
      expectedInvoiceId: "ACME-0008",
      lateIssueDateAcknowledged: false,
    } as const;

    const results = await Promise.all([
      invoiceApplication.issueInvoice(issueInput),
      invoiceApplication.issueInvoice(issueInput),
    ]);

    expect(results).toMatchObject([
      {
        kind: "issued",
        client: { invoiceSequence: { nextNumber: "9" } },
        invoice: {
          id: "ACME-0008",
          totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
          taxFacts: {
            kind: "gbp-uk-vat",
            vatTreatment: { kind: "uk-taxable", rate: "20", taxPoint: "2026-09-05" },
          },
        },
      },
      { kind: "invalid" },
    ]);
    expect(committedStates).toHaveLength(1);
    expect(committedStates[0]).toMatchObject({
      clients: [{ invoiceSequence: { nextNumber: "9" } }],
      draft: null,
      issuedInvoices: [{ id: "ACME-0008" }],
    });
  });

  it("issues one fresh snapshot and advances the selected client exactly once", async () => {
    const committedStates: WorkspaceState[] = [];
    const baseWorkspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      clients: [completeClient],
      draft: {
        kind: "ordinary",
        draft: persistedInvoiceDraftSchema.parse(createInvoiceDraft(completeClient)),
      },
      issuer: completeIssuer,
    });
    const workspaceRepository: WorkspaceRepository = {
      ...baseWorkspaceRepository,
      commitRetainedDocument: (state) => {
        committedStates.push(state);
        return baseWorkspaceRepository.save(state);
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      currentTimestamp: () => "2026-09-04T10:11:12.000Z",
      invoicePdf: {
        checkFit: () => Promise.resolve(true),
        prepare: (snapshot) =>
          Promise.resolve({
            bytes: new Uint8Array([37, 80, 68, 70]),
            pdf: { filename: `${snapshot.id}.pdf`, sha256: "c".repeat(64) },
          }),
      },
      workspaceRepository,
    });

    await expect(
      invoiceApplication.reviewInvoiceIssue(completeInvoiceDraftInput),
    ).resolves.toMatchObject({
      kind: "ready",
      candidate: { proposedInvoiceId: "GGIOHK-0043" },
    });
    await expect(
      invoiceApplication.issueInvoice({
        draft: completeInvoiceDraftInput,
        expectedInvoiceId: "GGIOHK-0043",
        lateIssueDateAcknowledged: false,
      }),
    ).resolves.toMatchObject({
      kind: "issued",
      invoice: { id: "GGIOHK-0043", retainedPdf: { sha256: "c".repeat(64) } },
      client: { invoiceSequence: { nextNumber: "44" } },
    });

    expect(committedStates).toHaveLength(1);
    expect(committedStates[0]).toMatchObject({
      draft: null,
      issuedInvoices: [{ id: "GGIOHK-0043" }],
      clients: [{ invoiceSequence: { nextNumber: "44" } }],
    });
  });

  it("keeps the draft and number when final PDF preparation fails", async () => {
    let issueCommitCount = 0;
    const baseWorkspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      clients: [completeClient],
      draft: {
        kind: "ordinary",
        draft: persistedInvoiceDraftSchema.parse(createInvoiceDraft(completeClient)),
      },
      issuer: completeIssuer,
    });
    const workspaceRepository: WorkspaceRepository = {
      ...baseWorkspaceRepository,
      commitRetainedDocument: () => {
        issueCommitCount += 1;
        return Promise.resolve();
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      invoicePdf: {
        checkFit: () => Promise.resolve(true),
        prepare: () => Promise.reject(new Error("PDF verification failed")),
      },
      workspaceRepository,
    });

    await expect(
      invoiceApplication.issueInvoice({
        draft: completeInvoiceDraftInput,
        expectedInvoiceId: "GGIOHK-0043",
        lateIssueDateAcknowledged: false,
      }),
    ).resolves.toEqual({
      kind: "failed",
      message:
        "The invoice was not issued. Your draft is safe, and GGIOHK-0043 was not used. Review and try again.",
    });
    expect(issueCommitCount).toBe(0);
    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        draft: { kind: "ordinary", draft: expect.any(Object) },
        issuedInvoices: [],
        clients: [{ invoiceSequence: { nextNumber: "43" } }],
      },
    });
  });

  it("keeps the recoverable draft when a current-draft save fails and saves it on retry", async () => {
    const savedDraft = persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput);
    const editedDraft = { ...completeInvoiceDraftInput, notes: "Latest notes" };
    const baseWorkspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      clients: [completeClient],
      draft: { kind: "ordinary", draft: savedDraft },
      issuer: completeIssuer,
    });
    let saveShouldFail = true;
    const workspaceRepository: WorkspaceRepository = {
      ...baseWorkspaceRepository,
      save: (workspace) => {
        if (saveShouldFail) {
          saveShouldFail = false;
          return Promise.reject(new Error("disk unavailable"));
        }
        return baseWorkspaceRepository.save(workspace);
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });

    await expect(invoiceApplication.saveInvoiceDraft(editedDraft)).resolves.toEqual({
      kind: "failed",
      message: "Could not save draft.",
    });
    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        clients: [{ invoiceSequence: { nextNumber: "43" } }],
        draft: { kind: "ordinary", draft: savedDraft },
        issuedInvoices: [],
      },
    });

    await expect(invoiceApplication.saveInvoiceDraft(editedDraft)).resolves.toMatchObject({
      draft: { notes: "Latest notes" },
      kind: "saved",
    });
  });

  it("refuses to issue a different fresh number than the owner confirmed", async () => {
    let issueCommitCount = 0;
    const baseWorkspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      clients: [completeClient],
      draft: {
        kind: "ordinary",
        draft: persistedInvoiceDraftSchema.parse(completeInvoiceDraftInput),
      },
      issuer: completeIssuer,
    });
    const workspaceRepository: WorkspaceRepository = {
      ...baseWorkspaceRepository,
      commitRetainedDocument: () => {
        issueCommitCount += 1;
        return Promise.resolve();
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });

    await expect(
      invoiceApplication.reviewInvoiceIssue(completeInvoiceDraftInput),
    ).resolves.toMatchObject({
      kind: "ready",
      candidate: { proposedInvoiceId: "GGIOHK-0043" },
    });
    await invoiceApplication.updateClient(completeClient.id, {
      ...completeClientInput,
      nextInvoiceNumber: "44",
    });
    await expect(
      invoiceApplication.issueInvoice({
        draft: completeInvoiceDraftInput,
        expectedInvoiceId: "GGIOHK-0043",
        lateIssueDateAcknowledged: false,
      }),
    ).resolves.toEqual({
      kind: "invalid",
      message: "The next invoice number changed. Review the invoice again.",
    });
    expect(issueCommitCount).toBe(0);
    await expect(
      invoiceApplication.reviewInvoiceIssue(completeInvoiceDraftInput),
    ).resolves.toMatchObject({
      kind: "ready",
      candidate: { proposedInvoiceId: "GGIOHK-0044" },
    });
  });

  it("requires a fresh late-date acknowledgement before PDF preparation or commit", async () => {
    let prepareCount = 0;
    let issueCommitCount = 0;
    const lateDraft = persistedInvoiceDraftSchema.parse({
      ...completeInvoiceDraftInput,
      billableDays: "1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-01",
    });
    const baseWorkspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      clients: [completeClient],
      draft: { kind: "ordinary", draft: lateDraft },
      issuer: completeIssuer,
    });
    const workspaceRepository: WorkspaceRepository = {
      ...baseWorkspaceRepository,
      commitRetainedDocument: () => {
        issueCommitCount += 1;
        return Promise.resolve();
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      invoicePdf: {
        checkFit: () => Promise.resolve(true),
        prepare: (snapshot) => {
          prepareCount += 1;
          return Promise.resolve({
            bytes: new Uint8Array([37, 80, 68, 70]),
            pdf: { filename: `${snapshot.id}.pdf`, sha256: "d".repeat(64) },
          });
        },
      },
      workspaceRepository,
    });

    await expect(
      invoiceApplication.issueInvoice({
        draft: lateDraft,
        expectedInvoiceId: "GGIOHK-0043",
        lateIssueDateAcknowledged: false,
      }),
    ).resolves.toEqual({ kind: "invalid", message: "Confirm that you checked the tax point." });
    expect(prepareCount).toBe(0);
    expect(issueCommitCount).toBe(0);

    await invoiceApplication.issueInvoice({
      draft: lateDraft,
      expectedInvoiceId: "GGIOHK-0043",
      lateIssueDateAcknowledged: true,
    });
    expect(prepareCount).toBe(1);
    expect(issueCommitCount).toBe(1);
  });

  it("returns only a hash-verified retained path for a historical invoice", async () => {
    let verifiedInvoiceId = "";
    const baseWorkspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      issuedInvoices: [completeIssuedInvoice],
    });
    const workspaceRepository: WorkspaceRepository = {
      ...baseWorkspaceRepository,
      retainedPdfPath: (document) => {
        verifiedInvoiceId = document.record.id;
        return Promise.resolve(`/retained-pdfs/${document.record.retainedPdf.filename}`);
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });

    await expect(
      invoiceApplication.findRetainedDocument(completeIssuedInvoice.id),
    ).resolves.toEqual({
      kind: "ready",
      document: { kind: "issued-invoice", record: completeIssuedInvoice },
      path: "/retained-pdfs/GGIOHK-0043.pdf",
    });
    expect(verifiedInvoiceId).toBe("GGIOHK-0043");
  });

  it("saves, resumes, and discards one draft without advancing its invoice number", async () => {
    const workspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      clients: [completeClient],
      issuer: completeIssuer,
    });
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });
    const draft = {
      ...createInvoiceDraft(completeClient),
      billableDays: "not a number yet",
      notes: "Work in progress",
    };

    await expect(invoiceApplication.saveInvoiceDraft(draft)).resolves.toEqual({
      kind: "saved",
      draft,
    });
    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        currentBusinessDate: "2026-09-04",
        draft: { kind: "ordinary", draft },
        clients: [{ invoiceSequence: { nextNumber: "43" } }],
      },
    });
    await expect(invoiceApplication.discardInvoiceDraft()).resolves.toEqual({ kind: "discarded" });
    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        draft: null,
        clients: [{ invoiceSequence: { nextNumber: "43" } }],
      },
    });
  });

  it("creates and updates clients through serialized durable state", async () => {
    const savedStates: WorkspaceState[] = [];
    const workspaceRepository: WorkspaceRepository = {
      ...unusedRetainedPdfAccess,
      commitRetainedDocument: () =>
        Promise.reject(new Error("Invoice issue is not used in this test")),
      load: () => Promise.resolve(initialWorkspaceState),
      save: (state) => {
        savedStates.push(state);
        return Promise.resolve();
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });

    await expect(invoiceApplication.createClient(completeClientInput)).resolves.toEqual({
      kind: "saved",
      client: completeClient,
    });
    await expect(
      invoiceApplication.updateClient(completeClient.id, {
        ...completeClientInput,
        legalName: "Genesis Global LLC",
      }),
    ).resolves.toMatchObject({
      kind: "saved",
      client: { id: completeClient.id, legalName: "Genesis Global LLC" },
    });
    expect(savedStates).toHaveLength(2);
    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        clients: [
          {
            ...completeClientFields,
            id: completeClient.id,
            legalName: "Genesis Global LLC",
          },
        ],
      },
    });
  });

  it("locks an issued client's identity and invoice sequence while saving future defaults", async () => {
    let saveCount = 0;
    const usedClient = persistedClientSchema.parse({
      ...completeClient,
      invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
    });
    const baseWorkspaceRepository = memoryWorkspaceRepository({
      ...initialWorkspaceState,
      clients: [usedClient],
      issuedInvoices: [completeIssuedInvoice],
      issuer: completeIssuer,
    });
    const workspaceRepository: WorkspaceRepository = {
      ...baseWorkspaceRepository,
      save: (state) => {
        saveCount += 1;
        return baseWorkspaceRepository.save(state);
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => "647253f4-113c-4d84-8381-c219776b7469",
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });
    const currentInput = { ...completeClientInput, nextInvoiceNumber: "44" };

    for (const lockedChange of [
      { ...currentInput, legalName: "Genesis Global LLC" },
      { ...currentInput, postalAddress: "A different registered address" },
      { ...currentInput, invoicePrefix: "GENESIS" },
      { ...currentInput, nextInvoiceNumber: "43" },
    ]) {
      await expect(invoiceApplication.updateClient(usedClient.id, lockedChange)).resolves.toEqual({
        kind: "invalid",
        message: "Client identity and invoice sequence are locked after the first invoice.",
      });
    }

    await expect(
      invoiceApplication.updateClient(usedClient.id, {
        ...currentInput,
        currencyCode: "GBP",
        standardDayRate: "900",
        paymentTerms: "Due within 14 days",
      }),
    ).resolves.toMatchObject({
      kind: "saved",
      client: {
        currency: { code: "GBP" },
        legalName: completeClient.legalName,
        paymentTerms: "Due within 14 days",
        standardDayRate: "900",
        invoiceSequence: { prefix: "GGIOHK", nextNumber: "44" },
      },
    });
    expect(saveCount).toBe(1);
  });

  it("rejects duplicate client prefixes without writing or changing current state", async () => {
    let saveCount = 0;
    const workspaceRepository: WorkspaceRepository = {
      ...unusedRetainedPdfAccess,
      commitRetainedDocument: () =>
        Promise.reject(new Error("Invoice issue is not used in this test")),
      load: () => Promise.resolve({ ...initialWorkspaceState, clients: [completeClient] }),
      save: () => {
        saveCount += 1;
        return Promise.resolve();
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => "647253f4-113c-4d84-8381-c219776b7469",
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });

    const result = await invoiceApplication.createClient({
      ...completeClientInput,
      legalName: "Another client",
    });

    expect(result).toEqual({
      kind: "invalid",
      message: "Client prefixes or identifiers are already in use.",
    });
    expect(saveCount).toBe(0);
    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: { clients: [completeClient] },
    });
  });

  it("rejects a duplicate generated client ID at the collection boundary", async () => {
    let saveCount = 0;
    const workspaceRepository: WorkspaceRepository = {
      ...unusedRetainedPdfAccess,
      commitRetainedDocument: () =>
        Promise.reject(new Error("Invoice issue is not used in this test")),
      load: () => Promise.resolve({ ...initialWorkspaceState, clients: [completeClient] }),
      save: () => {
        saveCount += 1;
        return Promise.resolve();
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });

    await expect(
      invoiceApplication.createClient({
        ...completeClientInput,
        legalName: "Another client",
        invoicePrefix: "OTHER",
      }),
    ).resolves.toEqual({
      kind: "invalid",
      message: "Client prefixes or identifiers are already in use.",
    });
    expect(saveCount).toBe(0);
  });

  it("keeps every client and sequence independent when one unused client changes", async () => {
    const otherClientInput: ClientInput = {
      ...completeClientInput,
      legalName: "Acme Research Ltd",
      currencyCode: "GBP",
      vatTreatment: "uk-taxable",
      vatRate: "20",
      invoicePrefix: "ACME",
      nextInvoiceNumber: "9007199254740993",
    };
    const clientIds = [completeClient.id, "647253f4-113c-4d84-8381-c219776b7469"];
    const workspaceRepository = memoryWorkspaceRepository();
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => {
        const clientId = clientIds.shift();
        if (!clientId) throw new Error("Expected another client ID");
        return clientId;
      },
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });
    const firstResult = await invoiceApplication.createClient(completeClientInput);
    const secondResult = await invoiceApplication.createClient(otherClientInput);
    if (firstResult.kind !== "saved" || secondResult.kind !== "saved") {
      throw new Error("Expected both clients to save");
    }

    await invoiceApplication.updateClient(firstResult.client.id, {
      ...completeClientInput,
      paymentTerms: "Due on receipt",
      nextInvoiceNumber: "44",
    });

    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: {
        clients: [
          { paymentTerms: "Due on receipt", invoiceSequence: { nextNumber: "44" } },
          {
            id: secondResult.client.id,
            legalName: "Acme Research Ltd",
            invoiceSequence: { nextNumber: "9007199254740993" },
          },
        ],
      },
    });
  });

  it("serializes every state mutation and keeps the latest durable state", async () => {
    const firstSave = deferred();
    const savedStates: WorkspaceState[] = [];
    let activeSaves = 0;
    let highestActiveSaveCount = 0;
    const workspaceRepository: WorkspaceRepository = {
      ...unusedRetainedPdfAccess,
      commitRetainedDocument: () =>
        Promise.reject(new Error("Invoice issue is not used in this test")),
      load: () => Promise.resolve(initialWorkspaceState),
      save: async (state) => {
        activeSaves += 1;
        highestActiveSaveCount = Math.max(highestActiveSaveCount, activeSaves);
        savedStates.push(state);
        if (savedStates.length === 1) await firstSave.promise;
        activeSaves -= 1;
      },
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });

    const firstResult = invoiceApplication.saveIssuerSettings(
      parseIssuerSettingsInput({
        ...completeIssuerInput,
        legalName: "First issuer name",
      }),
    );
    const secondResult = invoiceApplication.saveIssuerSettings(
      parseIssuerSettingsInput({
        ...completeIssuerInput,
        legalName: "Latest issuer name",
      }),
    );
    const workspaceWhileSaving = invoiceApplication.loadWorkspace();
    await Promise.resolve();

    expect(savedStates).toHaveLength(1);
    firstSave.resolve();
    await expect(firstResult).resolves.toMatchObject({ kind: "saved" });
    await expect(secondResult).resolves.toMatchObject({
      kind: "saved",
      issuer: { legalName: "Latest issuer name" },
    });
    expect(highestActiveSaveCount).toBe(1);
    expect(savedStates).toHaveLength(2);
    await expect(workspaceWhileSaving).resolves.toMatchObject({
      kind: "ready",
      workspace: { issuer: { legalName: "Latest issuer name" } },
    });
  });

  it("returns a typed filesystem failure without changing current state", async () => {
    let saveShouldFail = true;
    const workspaceRepository: WorkspaceRepository = {
      ...unusedRetainedPdfAccess,
      commitRetainedDocument: () =>
        Promise.reject(new Error("Invoice issue is not used in this test")),
      load: () => Promise.resolve(initialWorkspaceState),
      save: () =>
        saveShouldFail ? Promise.reject(new Error("disk unavailable")) : Promise.resolve(),
    };
    const invoiceApplication = await openInvoiceApplication({
      ...testIssueDependencies,
      appVersion: "0.1.0",
      createClientId: () => completeClient.id,
      currentBusinessDate: fixedBusinessDate,
      workspaceRepository,
    });

    const issuer = parseIssuerSettingsInput(completeIssuerInput);
    await expect(invoiceApplication.saveIssuerSettings(issuer)).resolves.toEqual({
      kind: "failed",
      message: "Could not save issuer settings.",
    });
    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: { issuer: null },
    });

    const draft = createInvoiceDraft(completeClient);
    await expect(invoiceApplication.saveInvoiceDraft(draft)).resolves.toEqual({
      kind: "failed",
      message: "Could not save draft.",
    });
    await expect(invoiceApplication.loadWorkspace()).resolves.toMatchObject({
      kind: "ready",
      workspace: { draft: null },
    });

    saveShouldFail = false;
    await expect(invoiceApplication.saveIssuerSettings(issuer)).resolves.toMatchObject({
      kind: "saved",
    });
  });
});

function fixedBusinessDate(): BusinessDate {
  return parseBusinessDate("2026-09-04");
}

function memoryWorkspaceRepository(
  initialWorkspace: WorkspaceState = initialWorkspaceState,
): WorkspaceRepository {
  let workspace = initialWorkspace;
  return {
    ...unusedRetainedPdfAccess,
    commitRetainedDocument: (state) => {
      workspace = state;
      return Promise.resolve();
    },
    load: () => Promise.resolve(workspace),
    save: (state) => {
      workspace = state;
      return Promise.resolve();
    },
  };
}

const testIssueDependencies = {
  creditNotePdf: {
    checkFit: () => Promise.resolve(true),
    prepare: () =>
      Promise.reject(new Error("Credit-note PDF preparation is not used in this test")),
  },
  currentTimestamp: () => "2026-09-04T10:11:12.000Z",
  datasetArchive: unusedDatasetArchive,
  invoicePdf: {
    checkFit: () => Promise.resolve(true),
    prepare: () => Promise.reject(new Error("Invoice PDF preparation is not used in this test")),
  },
} as const;

const unusedRetainedPdfAccess = {
  commitRetainedDocument: () =>
    Promise.reject(new Error("Retained document commit is not used in this test")),
  retainedPdfPath: () => Promise.reject(new Error("Retained PDF access is not used in this test")),
} as const;

type Deferred = Readonly<{ promise: Promise<void>; resolve: () => void }>;

function deferred(): Deferred {
  let deferredResolve: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    deferredResolve = resolve;
  });
  return {
    promise,
    resolve: () => {
      if (!deferredResolve) throw new Error("Deferred promise is not ready");
      deferredResolve();
    },
  };
}
