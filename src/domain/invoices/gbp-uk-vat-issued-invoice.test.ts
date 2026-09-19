import { describe, expect, it } from "vite-plus/test";

import { completeGbpVatClient } from "../../../tests/fixtures/client.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";
import { parseBusinessDate } from "../time/business-date.ts";
import { createInvoiceDraft, reviewInvoiceDraft } from "./invoice-draft.ts";
import {
  attachRetainedInvoicePdf,
  createIssuedInvoiceSnapshot,
  persistedIssuedInvoiceSchema,
} from "./issued-invoice.ts";

describe("issued GBP UK VAT invoice", () => {
  it("freezes the VAT rate, tax point, exact totals, and retained PDF identity", () => {
    const invoice = createGbpVatInvoice();

    expect(invoice).toMatchObject({
      id: "ACME-0008",
      invoiceNumber: "8",
      currency: { code: "GBP", minorUnit: 2 },
      totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
      serviceLines: [{ vatRate: "20" }],
      taxFacts: {
        kind: "gbp-uk-vat",
        vatTreatment: {
          kind: "uk-taxable",
          taxPoint: "2026-09-05",
          wording: "UK VAT applies.",
        },
      },
      retainedPdf: {
        filename: "ACME-0008.pdf",
        sha256: "c".repeat(64),
      },
    });
    expect(persistedIssuedInvoiceSchema.parse(invoice)).toEqual(invoice);
  });

  it.each([
    ["a non-GBP currency", { currency: { code: "USD", minorUnit: 2, name: "US Dollar" } }],
    [
      "a VAT rate outside the contract",
      {
        taxFacts: {
          kind: "gbp-uk-vat",
          vatTreatment: {
            kind: "uk-taxable",
            rate: "0",
            taxPoint: "2026-09-05",
            wording: "UK VAT applies.",
          },
        },
      },
    ],
    [
      "a tax point before service completion",
      {
        taxFacts: {
          kind: "gbp-uk-vat",
          vatTreatment: {
            kind: "uk-taxable",
            rate: "20",
            taxPoint: "2026-09-01",
            wording: "UK VAT applies.",
          },
        },
      },
    ],
    [
      "mismatched VAT wording",
      {
        taxFacts: {
          kind: "gbp-uk-vat",
          vatTreatment: {
            kind: "uk-taxable",
            rate: "20",
            taxPoint: "2026-09-05",
            wording: "VAT 20%",
          },
        },
      },
    ],
    [
      "a recalculated VAT mismatch",
      { totals: { gross: "3480.01", net: "2900.00", vat: "580.01" } },
    ],
  ] as const)("rejects %s in immutable history", (_name, mutation) => {
    expect(
      persistedIssuedInvoiceSchema.safeParse({ ...createGbpVatInvoice(), ...mutation }).success,
    ).toBe(false);
  });
});

function createGbpVatInvoice() {
  const draft = createInvoiceDraft(completeGbpVatClient);
  if (draft.vatTreatment !== "uk-taxable") {
    throw new Error("Expected a UK-taxable invoice draft");
  }
  const review = reviewInvoiceDraft({
    client: completeGbpVatClient,
    draft: {
      ...draft,
      issueDate: "2026-09-06",
      serviceLines: [
        {
          ...draft.serviceLines[0],
          billableDays: "4",
          periodEnd: "2026-09-05",
          periodStart: "2026-09-02",
        },
      ],
      taxPoint: "2026-09-05",
    },
    issuer: completeIssuer,
    today: parseBusinessDate("2026-09-06"),
  });
  if (!review.candidate) throw new Error("Expected a valid GBP VAT invoice candidate");

  return attachRetainedInvoicePdf({
    pdf: { filename: "ACME-0008.pdf", sha256: "c".repeat(64) },
    snapshot: createIssuedInvoiceSnapshot({
      candidate: review.candidate,
      invoiceNumber: "8",
      issuedAt: "2026-09-06T10:11:12.000Z",
      lateIssueDateAcknowledged: false,
    }),
  });
}
