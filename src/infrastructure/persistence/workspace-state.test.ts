import { describe, expect, it } from "vite-plus/test";

import { initialWorkspaceState } from "../../application/workspace.js";
import { createInvoiceDraft } from "../../domain/invoices/invoice-draft.js";
import { persistedCreditNoteSchema } from "../../domain/invoices/credit-note.js";
import { completeClient, completeGbpVatClient } from "../../../tests/fixtures/client.js";
import {
  completeCreditNote,
  completeForeignCurrencyVatIssuedInvoice,
  completeForeignCurrencyVatCreditNote,
  completeGbpVatInvoiceDraftInput,
  completeGbpVatIssuedInvoice,
  completeIssuedInvoice,
} from "../../../tests/fixtures/issued-invoice.js";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.js";
import { parseWorkspaceState } from "./workspace-state.js";
import { persistedIssuedInvoiceSchema } from "../../domain/invoices/issued-invoice.js";
import { WorkspaceRecoveryError } from "../../application/workspace-recovery.js";
import {
  fullWorkspaceStateConversions,
  supportedWorkspaceStateConversions,
} from "../../../tests/fixtures/workspace-state-conversions.js";

const { draft: _draft, ...workspaceWithoutDraft } = initialWorkspaceState;
const legacyInitialWorkspaceState = {
  ...workspaceWithoutDraft,
  invoiceDraft: null,
  replacementLinks: [],
};

describe("workspace state", () => {
  it.each(supportedWorkspaceStateConversions)(
    "converts the schema-v$schemaVersion release fixture exactly",
    ({ expectedV6, inputJson }) => {
      expect(parseWorkspaceState(inputJson)).toStrictEqual(expectedV6);
    },
  );

  it.each(fullWorkspaceStateConversions)(
    "converts the complete schema-v$schemaVersion release snapshot from $sourceCommit",
    ({ expectedV6, inputJson }) => {
      expect(parseWorkspaceState(inputJson)).toStrictEqual(expectedV6);
    },
  );

  it.each(supportedWorkspaceStateConversions)(
    "rejects a schema-v$schemaVersion draft whose client is missing after conversion",
    ({ inputJson }) => {
      // SAFETY: Every release fixture has a clients array and one draft.
      const releasedState = JSON.parse(inputJson) as { readonly clients: readonly unknown[] };

      expect(() => parseWorkspaceState(JSON.stringify({ ...releasedState, clients: [] }))).toThrow(
        expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "inconsistent" }),
      );
    },
  );

  it.each(supportedWorkspaceStateConversions)(
    "enforces the exact schema-v$schemaVersion release envelope",
    ({ inputJson }) => {
      // SAFETY: Every release fixture above includes a clients array.
      const releasedState = JSON.parse(inputJson) as { readonly clients: readonly unknown[] };
      const { clients: _clients, ...missingClients } = releasedState;

      for (const invalidState of [
        missingClients,
        { ...releasedState, futureWorkspaceField: true },
      ]) {
        expect(() => parseWorkspaceState(JSON.stringify(invalidState))).toThrow(
          expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "invalid-schema" }),
        );
      }
    },
  );

  it.each([
    JSON.stringify({}),
    JSON.stringify({ schemaVersion: "1" }),
    JSON.stringify({ schemaVersion: 1.5 }),
    JSON.stringify({ schemaVersion: 0 }),
    JSON.stringify({ schemaVersion: -1 }),
  ])("rejects an invalid schema version without probing release schemas", (stateJson) => {
    expect(() => parseWorkspaceState(stateJson)).toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "invalid-schema" }),
    );
  });

  it("does not parse a mislabeled release through another version's schema", () => {
    const { exchange: _exchange, ...schemaTwoDraft } = completeGbpVatInvoiceDraftInput;
    const mislabeledState = {
      ...legacyInitialWorkspaceState,
      schemaVersion: 1,
      invoiceDraft: schemaTwoDraft,
    };

    expect(() => parseWorkspaceState(JSON.stringify(mislabeledState))).toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "invalid-schema" }),
    );
  });

  it("classifies a non-canonical released issuer as an invalid schema", () => {
    const stateJson = JSON.stringify({
      ...legacyInitialWorkspaceState,
      schemaVersion: 2,
      issuer: { ...completeIssuer, vatRegistrationNumber: "GB 388 8021 60" },
    });

    expect(() => parseWorkspaceState(stateJson)).toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "invalid-schema" }),
    );
  });

  it.each([
    ["malformed", "not JSON"],
    ["invalid-schema", JSON.stringify({ ...initialWorkspaceState, clients: "invalid" })],
    [
      "inconsistent",
      JSON.stringify({
        ...initialWorkspaceState,
        creditNotes: [completeCreditNote],
        issuedInvoices: [],
      }),
    ],
    ["newer-version", JSON.stringify({ ...initialWorkspaceState, schemaVersion: 7 })],
  ] as const)("classifies %s state for recovery", (problem, stateJson) => {
    expect(() => parseWorkspaceState(stateJson)).toThrow(
      expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem }),
    );
  });

  it("upgrades schema v5 with no replacement in progress", () => {
    expect(
      parseWorkspaceState(JSON.stringify({ ...legacyInitialWorkspaceState, schemaVersion: 5 })),
    ).toEqual(initialWorkspaceState);
  });

  it("round-trips a recoverable replacement and a complete correction chain", () => {
    const replacementInvoice = replacementInvoiceFixture();
    const replacementSource = completeIssuedInvoice.id;
    const recoverableWorkspace = {
      ...initialWorkspaceState,
      clients: [completeClient],
      creditNotes: [completeCreditNote],
      draft: {
        kind: "replacement",
        draft: createInvoiceDraft(completeClient),
        source: replacementSource,
      },
      issuedInvoices: [completeIssuedInvoice],
    };
    const linkedWorkspace = {
      ...recoverableWorkspace,
      draft: null,
      issuedInvoices: [completeIssuedInvoice, replacementInvoice],
    };

    expect(parseWorkspaceState(JSON.stringify(recoverableWorkspace))).toEqual(recoverableWorkspace);
    expect(parseWorkspaceState(JSON.stringify(linkedWorkspace))).toEqual(linkedWorkspace);

    for (const invalidWorkspace of [
      { ...linkedWorkspace, creditNotes: [] },
      { ...linkedWorkspace, issuedInvoices: [replacementInvoice] },
      {
        ...recoverableWorkspace,
        draft: {
          ...recoverableWorkspace.draft,
          source: replacementInvoice.id,
        },
      },
      {
        ...linkedWorkspace,
        replacementLinks: [
          {
            creditNoteId: completeCreditNote.id,
            originalInvoiceId: completeIssuedInvoice.id,
            replacementInvoiceId: replacementInvoice.id,
          },
        ],
      },
    ]) {
      expect(() => parseWorkspaceState(JSON.stringify(invalidWorkspace))).toThrow(
        "The local dataset does not match a supported schema version",
      );
    }
  });

  it("round-trips the next full-credit-and-replacement link", () => {
    const firstReplacement = replacementInvoiceFixture();
    const secondCreditNote = persistedCreditNoteSchema.parse({
      ...completeCreditNote,
      id: "CN-GGIOHK-0044",
      originalInvoiceId: firstReplacement.id,
      issue: { ...completeCreditNote.issue, timestamp: "2026-09-08T11:11:12.000Z" },
      retainedPdf: { ...completeCreditNote.retainedPdf, filename: "CN-GGIOHK-0044.pdf" },
    });
    const secondReplacement = persistedIssuedInvoiceSchema.parse({
      ...firstReplacement,
      id: "GGIOHK-0045",
      invoiceNumber: "45",
      replacesInvoiceId: firstReplacement.id,
      issue: { ...firstReplacement.issue, timestamp: "2026-09-08T12:11:12.000Z" },
      retainedPdf: { ...firstReplacement.retainedPdf, filename: "GGIOHK-0045.pdf" },
    });
    const workspace = {
      ...initialWorkspaceState,
      clients: [completeClient],
      creditNotes: [completeCreditNote, secondCreditNote],
      issuedInvoices: [completeIssuedInvoice, firstReplacement, secondReplacement],
    };

    expect(parseWorkspaceState(JSON.stringify(workspace))).toEqual(workspace);
  });

  it("drops obsolete credit-note sequences from schema-v4 clients", () => {
    const upgradedState = parseWorkspaceState(
      JSON.stringify({
        ...legacyInitialWorkspaceState,
        schemaVersion: 4,
        clients: [
          {
            ...completeClient,
            creditNoteSequence: { prefix: "CNGGIOHK", nextNumber: "7" },
          },
        ],
      }),
    );

    expect(upgradedState.schemaVersion).toBe(6);
    expect(upgradedState.clients[0]).not.toHaveProperty("creditNoteSequence");
  });

  it.each([1, 2, 3, 4] as const)(
    "rejects schema-v%s client sequence collisions before removing legacy sequences",
    (schemaVersion) => {
      const firstClient = {
        ...completeClient,
        creditNoteSequence: { prefix: "CNGGIOHK", nextNumber: "7" },
      };
      const secondClient = {
        ...completeClient,
        id: "a8d5bf7f-55c2-464c-a25c-48f99ecf30cc",
        invoiceSequence: { prefix: "CNGGIOHK", nextNumber: "99" },
        creditNoteSequence: { prefix: "CNOTHER", nextNumber: "1" },
      };

      expect(() =>
        parseWorkspaceState(
          JSON.stringify({
            ...legacyInitialWorkspaceState,
            schemaVersion,
            clients: [firstClient, secondClient],
          }),
        ),
      ).toThrow(
        expect.objectContaining<Partial<WorkspaceRecoveryError>>({ problem: "invalid-schema" }),
      );
    },
  );

  it("converts a legacy outside-scope draft to the current draft contract", () => {
    const currentOutsideScopeDraft = createInvoiceDraft(completeClient);
    const { vatTreatment, ...legacyOutsideScopeDraft } = currentOutsideScopeDraft;
    expect(vatTreatment).toBe("outside-scope");

    const upgradedState = parseWorkspaceState(
      JSON.stringify({
        ...legacyInitialWorkspaceState,
        schemaVersion: 1,
        clients: [
          {
            ...completeClient,
            creditNoteSequence: { prefix: "CNGGIOHK", nextNumber: "43" },
          },
        ],
        invoiceDraft: legacyOutsideScopeDraft,
      }),
    );

    expect(upgradedState).toMatchObject({
      schemaVersion: 6,
      draft: { kind: "ordinary", draft: currentOutsideScopeDraft },
    });
  });

  it("converts schema-v2 UK VAT drafts and invoices to finalized tax facts", () => {
    const { exchange: _exchange, ...legacyDraft } = completeGbpVatInvoiceDraftInput;
    const legacyInvoice = createSchemaTwoGbpVatIssuedInvoice();

    const upgradedState = parseWorkspaceState(
      JSON.stringify({
        ...legacyInitialWorkspaceState,
        schemaVersion: 2,
        clients: [
          {
            ...completeGbpVatClient,
            creditNoteSequence: { prefix: "CNACME", nextNumber: "8" },
          },
        ],
        invoiceDraft: legacyDraft,
        issuedInvoices: [legacyInvoice],
      }),
    );

    expect(upgradedState).toMatchObject({
      schemaVersion: 6,
      draft: { kind: "ordinary", draft: { exchange: { kind: "not-required" } } },
      issuedInvoices: [{ taxFacts: { kind: "gbp-uk-vat" } }],
    });
  });

  it("rejects schema-v2 issued invoices outside their historical object contract", () => {
    const legacyInvoice = createSchemaTwoGbpVatIssuedInvoice();
    const { serviceDescription: _serviceDescription, ...missingRequiredField } = legacyInvoice;

    for (const invalidInvoice of [
      missingRequiredField,
      { ...legacyInvoice, futureTaxField: "not part of schema v2" },
    ]) {
      expect(() =>
        parseWorkspaceState(
          JSON.stringify({
            ...legacyInitialWorkspaceState,
            schemaVersion: 2,
            issuedInvoices: [invalidInvoice],
          }),
        ),
      ).toThrow("The local dataset does not match a supported schema version");
    }
  });

  it("round-trips foreign-currency VAT evidence and sterling totals", () => {
    const workspace = parseWorkspaceState(
      JSON.stringify({
        ...initialWorkspaceState,
        issuedInvoices: [completeForeignCurrencyVatIssuedInvoice],
      }),
    );

    expect(workspace.issuedInvoices[0]).toMatchObject({
      id: "USDVAT-0012",
      taxFacts: {
        kind: "foreign-currency-uk-vat",
        sterlingVatSummary: {
          exchangeRecord: {
            effectiveDate: "2026-09-05",
            evidenceReference: "HMRC monthly exchange rates, September 2026",
            method: "hmrc-period-rate",
            rate: "1.25",
          },
          totals: { gross: "2784.00", net: "2320.00", vat: "464.00" },
        },
      },
    });
  });

  it("round-trips the immutable GBP VAT calculation and evidence", () => {
    const workspace = parseWorkspaceState(
      JSON.stringify({
        ...initialWorkspaceState,
        issuedInvoices: [completeGbpVatIssuedInvoice],
      }),
    );

    expect(workspace.issuedInvoices[0]).toMatchObject({
      id: "ACME-0008",
      totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
      taxFacts: {
        kind: "gbp-uk-vat",
        vatTreatment: {
          kind: "uk-taxable",
          rate: "20",
          taxPoint: "2026-09-05",
          wording: "UK VAT applies.",
        },
      },
    });
  });

  it("round-trips immutable issued invoices and rejects duplicate IDs", () => {
    expect(
      parseWorkspaceState(
        JSON.stringify({ ...initialWorkspaceState, issuedInvoices: [completeIssuedInvoice] }),
      ),
    ).toMatchObject({ issuedInvoices: [completeIssuedInvoice] });

    expect(() =>
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          issuedInvoices: [completeIssuedInvoice, completeIssuedInvoice],
        }),
      ),
    ).toThrow("The local dataset does not match a supported schema version");
  });

  it("round-trips a linked credit note and rejects a changed historical fact", () => {
    expect(
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          creditNotes: [completeForeignCurrencyVatCreditNote],
          issuedInvoices: [completeForeignCurrencyVatIssuedInvoice],
        }),
      ),
    ).toMatchObject({ creditNotes: [completeForeignCurrencyVatCreditNote] });

    expect(() =>
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          creditNotes: [
            { ...completeForeignCurrencyVatCreditNote, serviceDescription: "Changed history" },
          ],
          issuedInvoices: [completeForeignCurrencyVatIssuedInvoice],
        }),
      ),
    ).toThrow("The local dataset does not match a supported schema version");
  });

  it("round-trips one incomplete invoice draft and rejects cross-treatment fields", () => {
    const invoiceDraft = createInvoiceDraft(completeClient);

    expect(
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          clients: [completeClient],
          draft: { kind: "ordinary", draft: invoiceDraft },
        }),
      ),
    ).toMatchObject({ draft: { kind: "ordinary", draft: invoiceDraft } });
    expect(() =>
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          clients: [completeClient],
          draft: {
            kind: "ordinary",
            draft: { ...invoiceDraft, taxPoint: "2026-09-04" },
          },
        }),
      ),
    ).toThrow("The local dataset does not match a supported schema version");
    expect(() =>
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          clients: [completeClient],
          draft: {
            kind: "ordinary",
            draft: {
              ...completeGbpVatInvoiceDraftInput,
              outsideScopeEvidenceReference: "not valid for a UK-taxable draft",
            },
          },
        }),
      ),
    ).toThrow("The local dataset does not match a supported schema version");
  });

  it("rejects an invoice draft whose client is missing from the workspace", () => {
    const invoiceDraft = createInvoiceDraft(completeClient);

    expect(() =>
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          draft: { kind: "ordinary", draft: invoiceDraft },
        }),
      ),
    ).toThrow("The local dataset does not match a supported schema version");
  });

  it("rejects client collections with duplicate IDs or invoice prefixes", () => {
    const otherClient = {
      ...completeClient,
      invoiceSequence: { prefix: "OTHER", nextNumber: "1" },
    };

    expect(() =>
      parseWorkspaceState(
        JSON.stringify({ ...initialWorkspaceState, clients: [completeClient, otherClient] }),
      ),
    ).toThrow("The local dataset does not match a supported schema version");

    expect(() =>
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          clients: [
            completeClient,
            {
              ...otherClient,
              id: "647253f4-113c-4d84-8381-c219776b7469",
              invoiceSequence: { prefix: "GGIOHK", nextNumber: "99" },
            },
          ],
        }),
      ),
    ).toThrow("The local dataset does not match a supported schema version");
  });

  it("rejects persisted day rates that exceed the currency precision", () => {
    expect(() =>
      parseWorkspaceState(
        JSON.stringify({
          ...initialWorkspaceState,
          clients: [{ ...completeClient, standardDayRate: "725.001" }],
        }),
      ),
    ).toThrow("The local dataset does not match a supported schema version");
  });
});

function replacementInvoiceFixture() {
  return persistedIssuedInvoiceSchema.parse({
    ...completeIssuedInvoice,
    id: "GGIOHK-0044",
    invoiceNumber: "44",
    replacesInvoiceId: completeIssuedInvoice.id,
    retainedPdf: { ...completeIssuedInvoice.retainedPdf, filename: "GGIOHK-0044.pdf" },
    issue: { ...completeIssuedInvoice.issue, timestamp: "2026-09-08T10:11:12.000Z" },
  });
}

function createSchemaTwoGbpVatIssuedInvoice() {
  if (completeGbpVatIssuedInvoice.taxFacts.kind !== "gbp-uk-vat") {
    throw new Error("Expected GBP VAT facts");
  }
  const {
    replacesInvoiceId: _replacesInvoiceId,
    taxFacts,
    ...legacyInvoiceFields
  } = completeGbpVatIssuedInvoice;
  return { ...legacyInvoiceFields, vatTreatment: taxFacts.vatTreatment };
}
