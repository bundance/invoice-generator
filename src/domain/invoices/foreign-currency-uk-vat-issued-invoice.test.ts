import { describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../clients/client.ts";
import { parseBusinessDate } from "../time/business-date.ts";
import { createInvoiceDraft, reviewInvoiceDraft } from "./invoice-draft.ts";
import {
  attachRetainedInvoicePdf,
  createIssuedInvoiceSnapshot,
  persistedIssuedInvoiceSchema,
} from "./issued-invoice.ts";
import { completeGbpVatClient } from "../../../tests/fixtures/client.ts";
import { completeGbpVatIssuedInvoice } from "../../../tests/fixtures/issued-invoice.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";

describe("foreign-currency UK VAT issued invoice", () => {
  it("retains the complete exchange record and independently calculated sterling totals", () => {
    const invoice = createForeignCurrencyVatInvoice();

    expect(invoice).toMatchObject({
      currency: { code: "USD", minorUnit: 2 },
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
      totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
    });
    expect(persistedIssuedInvoiceSchema.parse(invoice)).toEqual(invoice);
  });

  it("rejects missing, inapplicable, or recalculated sterling evidence", () => {
    const invoice = createForeignCurrencyVatInvoice();
    if (invoice.taxFacts.kind !== "foreign-currency-uk-vat") {
      throw new Error("Expected foreign-currency UK VAT facts");
    }
    const { taxFacts } = invoice;

    expect(
      persistedIssuedInvoiceSchema.safeParse({
        ...invoice,
        taxFacts: { kind: "foreign-currency-uk-vat", vatTreatment: taxFacts.vatTreatment },
      }).success,
    ).toBe(false);
    expect(
      persistedIssuedInvoiceSchema.safeParse({
        ...invoice,
        taxFacts: {
          ...taxFacts,
          sterlingVatSummary: {
            ...taxFacts.sterlingVatSummary,
            exchangeRecord: {
              ...taxFacts.sterlingVatSummary.exchangeRecord,
              effectiveDate: "2025-01-01",
            },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      persistedIssuedInvoiceSchema.safeParse({
        ...invoice,
        taxFacts: {
          ...taxFacts,
          sterlingVatSummary: {
            ...taxFacts.sterlingVatSummary,
            exchangeRecord: {
              ...taxFacts.sterlingVatSummary.exchangeRecord,
              effectiveDate: "2026-09-04",
              method: "uk-market-selling-rate",
            },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      persistedIssuedInvoiceSchema.safeParse({
        ...invoice,
        taxFacts: {
          ...taxFacts,
          sterlingVatSummary: {
            ...taxFacts.sterlingVatSummary,
            totals: { ...taxFacts.sterlingVatSummary.totals, vat: "464.01" },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      persistedIssuedInvoiceSchema.safeParse({
        ...invoice,
        taxFacts: {
          ...taxFacts,
          sterlingVatSummary: {
            ...taxFacts.sterlingVatSummary,
            exchangeRecord: {
              ...taxFacts.sterlingVatSummary.exchangeRecord,
              effectiveDate: "2026-09-06",
            },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      persistedIssuedInvoiceSchema.safeParse({
        ...completeGbpVatIssuedInvoice,
        taxFacts,
      }).success,
    ).toBe(false);
  });
});

function createForeignCurrencyVatInvoice() {
  const client = persistedClientSchema.parse({
    ...completeGbpVatClient,
    currency: { code: "USD", minorUnit: 2, name: "US Dollar" },
  });
  const draft = createInvoiceDraft(client);
  if (draft.vatTreatment !== "uk-taxable") {
    throw new Error("Expected a UK-taxable invoice draft");
  }
  const review = reviewInvoiceDraft({
    client,
    draft: {
      ...draft,
      billableDays: "4",
      exchange: {
        effectiveDate: "2026-09-05",
        evidenceReference: "HMRC monthly exchange rates, September 2026",
        kind: "required",
        method: "hmrc-period-rate",
        rate: "1.25",
      },
      issueDate: "2026-09-06",
      periodEnd: "2026-09-05",
      periodStart: "2026-09-02",
      taxPoint: "2026-09-05",
    },
    issuer: completeIssuer,
    today: parseBusinessDate("2026-09-06"),
  });
  if (!review.candidate) throw new Error("Expected a valid foreign-currency VAT invoice candidate");

  return attachRetainedInvoicePdf({
    pdf: { filename: "ACME-0008.pdf", sha256: "d".repeat(64) },
    snapshot: createIssuedInvoiceSnapshot({
      candidate: review.candidate,
      invoiceNumber: "8",
      issuedAt: "2026-09-06T10:11:12.000Z",
      lateIssueDateAcknowledged: false,
    }),
  });
}
