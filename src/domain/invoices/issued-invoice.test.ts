import { describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../clients/client.js";
import { completeClient } from "../../../tests/fixtures/client.js";
import {
  completeInvoiceDraftInput,
  completeIssuedInvoice,
} from "../../../tests/fixtures/issued-invoice.js";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.js";
import { parseBusinessDate } from "../time/business-date.js";
import { reviewInvoiceDraft } from "./invoice-draft.js";
import {
  attachRetainedInvoicePdf,
  createIssuedInvoiceSnapshot,
  persistedIssuedInvoiceSchema,
} from "./issued-invoice.js";

describe("issued outside-scope invoice", () => {
  it("freezes the validated facts, issue event, and retained PDF identity", () => {
    const review = reviewInvoiceDraft({
      client: completeClient,
      draft: {
        clientId: completeClient.id,
        clientLegalName: "  Genesis Global  ",
        clientPostalAddress: "123 Market Street\nNew York\nNY 10001",
        currencyCode: "USD",
        serviceDescription: "React Native consultancy",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        issueDate: "2026-09-04",
        billableDays: "5",
        dayRate: "725",
        paymentTerms: "Due within 30 days",
        notes: "Thank you",
        purchaseOrder: "PO-43",
        vatTreatment: "outside-scope",
        outsideScopeEvidenceReference: "Contract and tax certificate",
        reverseCharge: true,
      },
      issuer: completeIssuer,
      today: parseBusinessDate("2026-09-04"),
    });
    if (!review.candidate) throw new Error("Expected a valid invoice candidate");

    const snapshot = createIssuedInvoiceSnapshot({
      candidate: review.candidate,
      invoiceNumber: completeClient.invoiceSequence.nextNumber,
      issuedAt: "2026-09-04T10:11:12.000Z",
      lateIssueDateAcknowledged: false,
    });
    const invoice = attachRetainedInvoicePdf({
      pdf: {
        filename: "GGIOHK-0043.pdf",
        sha256: "a".repeat(64),
      },
      snapshot,
    });

    expect(invoice).toMatchObject({
      id: "GGIOHK-0043",
      invoiceNumber: "43",
      replacesInvoiceId: null,
      client: { id: completeClient.id, legalName: "Genesis Global" },
      issue: {
        date: "2026-09-04",
        timestamp: "2026-09-04T10:11:12.000Z",
        businessTimezone: "Europe/London",
        lateIssueDateAcknowledged: false,
      },
      totals: { net: "3625.00", vat: "0.00", gross: "3625.00" },
      retainedPdf: {
        filename: "GGIOHK-0043.pdf",
        sha256: "a".repeat(64),
      },
      taxFacts: {
        kind: "outside-scope",
        vatTreatment: {
          kind: "outside-scope",
          reverseCharge: true,
          wording:
            "Outside the scope of UK VAT. Subject to reverse charge in the country of receipt.",
        },
      },
    });
    expect(persistedIssuedInvoiceSchema.parse(invoice)).toEqual(invoice);
  });

  it("stores the original invoice ID on a replacement snapshot", () => {
    const replacementClient = persistedClientSchema.parse({
      ...completeClient,
      invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
    });
    const review = reviewInvoiceDraft({
      client: replacementClient,
      draft: { ...completeInvoiceDraftInput, issueDate: "2026-09-08" },
      issuer: completeIssuer,
      today: parseBusinessDate("2026-09-08"),
    });
    if (!review.candidate) throw new Error("Expected a valid replacement candidate");

    expect(
      createIssuedInvoiceSnapshot({
        candidate: review.candidate,
        invoiceNumber: "44",
        issuedAt: "2026-09-08T10:11:12.000Z",
        lateIssueDateAcknowledged: false,
        replacesInvoiceId: completeIssuedInvoice.id,
      }),
    ).toMatchObject({ id: "GGIOHK-0044", replacesInvoiceId: "GGIOHK-0043" });
  });

  it("rejects retained files that do not match the invoice ID", () => {
    const invoice = completeIssuedInvoice;

    expect(() =>
      persistedIssuedInvoiceSchema.parse({
        ...invoice,
        retainedPdf: { ...invoice.retainedPdf, filename: "OTHER-0001.pdf" },
      }),
    ).toThrow("The retained PDF filename must match the invoice ID.");
  });

  it.each([
    ["an impossible date", { periodEnd: "2026-02-30" }],
    ["zero billable days", { billableDays: "0" }],
    ["noncanonical billable days", { billableDays: "1.50" }],
    ["an overlong decimal", { dayRate: "9".repeat(201) }],
    ["a noncanonical day rate", { dayRate: "725.0" }],
    ["a day rate with excess precision", { dayRate: "725.001" }],
    [
      "noncanonical client text",
      { client: { ...completeIssuedInvoice.client, legalName: " Genesis Global " } },
    ],
    ["a control character", { notes: "Invalid\u0000note" }],
    ["overlong multiline text", { serviceDescription: "x".repeat(1_001) }],
    ["a mismatched calculated net total", { totals: { net: "1.00", vat: "0.00", gross: "1.00" } }],
    [
      "VAT wording inconsistent with reverse charge",
      {
        taxFacts: {
          ...completeIssuedInvoice.taxFacts,
          vatTreatment: {
            ...completeIssuedInvoice.taxFacts.vatTreatment,
            wording: "Outside the scope of UK VAT.",
          },
        },
      },
    ],
    [
      "an unacknowledged late issue date",
      {
        periodStart: "2026-08-01",
        periodEnd: "2026-08-01",
        issue: {
          ...completeIssuedInvoice.issue,
          date: "2026-09-04",
          lateIssueDateAcknowledged: false,
        },
      },
    ],
  ])("rejects %s in immutable history", (_caseName, mutation) => {
    expect(
      persistedIssuedInvoiceSchema.safeParse({ ...completeIssuedInvoice, ...mutation }).success,
    ).toBe(false);
  });

  it("keeps a structurally valid historical currency after it leaves the active list", () => {
    const historicalInvoice = {
      ...completeIssuedInvoice,
      currency: { code: "ZZZ", minorUnit: 2, name: "Retired test currency" },
    };

    expect(persistedIssuedInvoiceSchema.parse(historicalInvoice).currency).toEqual(
      historicalInvoice.currency,
    );
  });
});
