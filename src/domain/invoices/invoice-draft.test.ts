import { describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../clients/client.ts";
import { parseBusinessDate } from "../time/business-date.ts";
import { createInvoiceDraft, reviewInvoiceDraft } from "./invoice-draft.ts";
import { completeClient } from "../../../tests/fixtures/client.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";

const businessDate = parseBusinessDate("2026-09-04");

describe("outside-scope invoice draft", () => {
  it("copies editable client defaults and calculates exact half-up totals without using a number", () => {
    const draft = {
      ...createInvoiceDraft(completeClient),
      billableDays: "0.25",
      dayRate: "0.02",
      issueDate: "2026-09-04",
      periodEnd: "2026-09-04",
      periodStart: "2026-09-04",
    };

    const review = reviewInvoiceDraft({
      client: completeClient,
      draft,
      issuer: completeIssuer,
      today: businessDate,
    });

    expect(draft).toMatchObject({
      clientId: completeClient.id,
      clientLegalName: completeClient.legalName,
      currencyCode: "USD",
      dayRate: "0.02",
      outsideScopeEvidenceReference: "Contract and tax certificate",
      serviceDescription: completeClient.defaultServiceDescription,
    });
    expect(review).toMatchObject({
      candidate: {
        proposedInvoiceId: "GGIOHK-0043",
        totals: {
          gross: "0.01",
          net: "0.01",
          vat: "0.00",
        },
      },
      errors: [],
      formattedTotals: {
        gross: "USD 0.01",
        net: "USD 0.01",
        vat: "USD 0.00",
      },
      warnings: [],
    });
    expect(completeClient.invoiceSequence.nextNumber).toBe("43");
  });

  it.each([
    {
      currency: { code: "JPY", minorUnit: 0, name: "Yen" },
      dayRate: "2",
      expectedAmount: "JPY 1",
    },
    {
      currency: { code: "BHD", minorUnit: 3, name: "Bahraini Dinar" },
      dayRate: "0.002",
      expectedAmount: "BHD 0.001",
    },
  ])(
    "rounds $currency.code at its stored minor-unit precision",
    ({ currency, dayRate, expectedAmount }) => {
      const client = persistedClientSchema.parse({
        ...completeClient,
        currency,
        standardDayRate: dayRate,
      });
      const review = reviewInvoiceDraft({
        client,
        draft: {
          ...createInvoiceDraft(client),
          billableDays: "0.25",
          issueDate: "2026-09-04",
          periodEnd: "2026-09-04",
          periodStart: "2026-09-04",
        },
        issuer: completeIssuer,
        today: businessDate,
      });

      expect(review.formattedTotals?.gross).toBe(expectedAmount);
    },
  );

  it("keeps malformed numeric input unavailable and reports date and quantity errors", () => {
    const review = reviewInvoiceDraft({
      client: completeClient,
      draft: {
        ...createInvoiceDraft(completeClient),
        billableDays: "1.2",
        dayRate: "not-a-rate",
        issueDate: "2026-09-05",
        periodEnd: "2026-09-03",
        periodStart: "2026-09-04",
      },
      issuer: completeIssuer,
      today: businessDate,
    });

    expect(review.candidate).toBeNull();
    expect(review.formattedTotals).toBeNull();
    expect(review.errors).toEqual(
      expect.arrayContaining([
        { fieldName: "billableDays", message: "Use quarter-day increments." },
        { fieldName: "dayRate", message: "Enter a positive amount." },
        { fieldName: "periodEnd", message: "The period end cannot precede its start." },
        { fieldName: "issueDate", message: "The issue date cannot be in the future." },
      ]),
    );
  });

  it("normalizes candidate text and warns without blocking when issue is more than 14 days late", () => {
    const review = reviewInvoiceDraft({
      client: completeClient,
      draft: {
        ...createInvoiceDraft(completeClient),
        billableDays: "1.00",
        clientLegalName: "  Genesis   Global  ",
        issueDate: "2026-09-04",
        notes: "  First line\r\nSecond line  ",
        periodEnd: "2026-08-01",
        periodStart: "2026-08-01",
        purchaseOrder: "  PO   42  ",
      },
      issuer: completeIssuer,
      today: businessDate,
    });

    expect(review.candidate).toMatchObject({
      billableDays: "1",
      client: { legalName: "Genesis Global" },
      notes: "First line\nSecond line",
      purchaseOrder: "PO 42",
    });
    expect(review.preview).toMatchObject({
      billableDays: "1",
      clientLegalName: "Genesis Global",
      formattedDayRate: "USD 725.00",
      notes: "First line\nSecond line",
      purchaseOrder: "PO 42",
    });
    expect(review.warnings).toEqual([
      {
        kind: "late-issue-date",
        message:
          "The issue date is more than 14 days after the service period. Check the tax point before issue.",
      },
    ]);
  });

  it("withholds totals when billable days exceed the normalized service period", () => {
    const review = reviewInvoiceDraft({
      client: completeClient,
      draft: {
        ...createInvoiceDraft(completeClient),
        billableDays: "2",
        issueDate: "2026-09-04",
        periodEnd: "2026-09-04",
        periodStart: "2026-09-04",
      },
      issuer: completeIssuer,
      today: businessDate,
    });

    expect(review.formattedTotals).toBeNull();
    expect(review.totals).toBeNull();
    expect(review.errors).toContainEqual({
      fieldName: "billableDays",
      message: "Billable days cannot exceed the 1 day in the invoice period.",
    });
  });
});
