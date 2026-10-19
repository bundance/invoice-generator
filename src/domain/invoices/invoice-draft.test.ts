import { describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../clients/client.ts";
import { parseBusinessDate } from "../time/business-date.ts";
import {
  createInvoiceDraft,
  createInvoiceServiceLineInput,
  reviewInvoiceDraft,
} from "./invoice-draft.ts";
import { completeClient, completeGbpVatClient } from "../../../tests/fixtures/client.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";

const businessDate = parseBusinessDate("2026-09-04");

if (completeGbpVatClient.vatTreatment.kind !== "uk-taxable") {
  throw new Error("Expected a UK-taxable client fixture");
}
const completeGbpVatRate = completeGbpVatClient.vatTreatment.rate;

describe("outside-scope invoice draft", () => {
  it("uses the same client defaults for new taxable and outside-scope service lines", () => {
    const taxableDraft = createInvoiceDraft(completeGbpVatClient);
    if (taxableDraft.vatTreatment !== "uk-taxable") {
      throw new Error("Expected a UK-taxable draft fixture");
    }
    const outsideScopeDraft = createInvoiceDraft(completeClient);

    expect(createInvoiceServiceLineInput(completeClient)).toEqual({
      billableDays: "",
      dayRate: completeClient.standardDayRate,
      periodEnd: "",
      periodStart: "",
      serviceDescription: completeClient.defaultServiceDescription,
    });
    expect(createInvoiceServiceLineInput(completeGbpVatClient)).toEqual({
      billableDays: "",
      dayRate: completeGbpVatClient.standardDayRate,
      periodEnd: "",
      periodStart: "",
      serviceDescription: completeGbpVatClient.defaultServiceDescription,
      vatRate: completeGbpVatRate,
    });
    expect(
      createInvoiceServiceLineInput(completeGbpVatClient, outsideScopeDraft),
    ).not.toHaveProperty("vatRate");
    expect(createInvoiceServiceLineInput(completeClient, taxableDraft)).toMatchObject({
      vatRate: taxableDraft.serviceLines[0].vatRate,
    });
  });

  it("copies editable client defaults and calculates exact half-up totals without using a number", () => {
    const draft = {
      ...createOutsideScopeDraft(completeClient),
      issueDate: "2026-09-04",
      serviceLines: [
        {
          ...createOutsideScopeDraft(completeClient).serviceLines[0],
          billableDays: "0.25",
          dayRate: "0.02",
          periodEnd: "2026-09-04",
          periodStart: "2026-09-04",
        },
      ] as const,
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
      outsideScopeEvidenceReference: "Contract and tax certificate",
      serviceLines: [
        {
          dayRate: "0.02",
          serviceDescription: completeClient.defaultServiceDescription,
        },
      ],
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
        gross: "$0.01",
        net: "$0.01",
        vat: "$0.00",
      },
      warnings: [],
    });
    expect(completeClient.invoiceSequence.nextNumber).toBe("43");
  });

  it.each([
    {
      currency: { code: "JPY", minorUnit: 0, name: "Yen" },
      dayRate: "2",
      expectedAmount: "¥1",
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
          ...createOutsideScopeDraft(client),
          issueDate: "2026-09-04",
          serviceLines: [
            {
              ...createOutsideScopeDraft(client).serviceLines[0],
              billableDays: "0.25",
              periodEnd: "2026-09-04",
              periodStart: "2026-09-04",
            },
          ],
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
        ...createOutsideScopeDraft(completeClient),
        issueDate: "2026-09-05",
        serviceLines: [
          {
            ...createOutsideScopeDraft(completeClient).serviceLines[0],
            billableDays: "1.2",
            dayRate: "not-a-rate",
            periodEnd: "2026-09-03",
            periodStart: "2026-09-04",
          },
        ],
      },
      issuer: completeIssuer,
      today: businessDate,
    });

    expect(review.candidate).toBeNull();
    expect(review.formattedTotals).toBeNull();
    expect(review.errors).toEqual(
      expect.arrayContaining([
        {
          location: { kind: "service-line", serviceLineIndex: 0, fieldName: "billableDays" },
          message: "Use quarter-day increments.",
        },
        {
          location: { kind: "service-line", serviceLineIndex: 0, fieldName: "dayRate" },
          message: "Enter a positive amount.",
        },
        {
          location: { kind: "service-line", serviceLineIndex: 0, fieldName: "periodEnd" },
          message: "The period end cannot precede its start.",
        },
        {
          location: { kind: "invoice", fieldName: "issueDate" },
          message: "The issue date cannot be in the future.",
        },
      ]),
    );
  });

  it("normalizes candidate text and warns without blocking when issue is more than 14 days late", () => {
    const review = reviewInvoiceDraft({
      client: completeClient,
      draft: {
        ...createOutsideScopeDraft(completeClient),
        clientLegalName: "  Genesis   Global  ",
        issueDate: "2026-09-04",
        notes: "  First line\r\nSecond line  ",
        serviceLines: [
          {
            ...createOutsideScopeDraft(completeClient).serviceLines[0],
            billableDays: "1.00",
            periodEnd: "2026-08-01",
            periodStart: "2026-08-01",
          },
        ],
        purchaseOrder: "  PO   42  ",
      },
      issuer: completeIssuer,
      today: businessDate,
    });

    expect(review.candidate).toMatchObject({
      client: { legalName: "Genesis Global" },
      notes: "First line\nSecond line",
      purchaseOrder: "PO 42",
    });
    expect(review.preview).toMatchObject({
      clientLegalName: "Genesis Global",
      notes: "First line\nSecond line",
      purchaseOrder: "PO 42",
      serviceLines: [{ billableDays: "1", formattedDayRate: "$725.00" }],
    });
    expect(review.warnings).toEqual([
      {
        kind: "late-issue-date",
        message:
          "The issue date is more than 14 days after the latest service period. Check the tax point before issue.",
      },
    ]);
  });

  it("withholds totals when billable days exceed the normalized service period", () => {
    const review = reviewInvoiceDraft({
      client: completeClient,
      draft: {
        ...createOutsideScopeDraft(completeClient),
        issueDate: "2026-09-04",
        serviceLines: [
          {
            ...createOutsideScopeDraft(completeClient).serviceLines[0],
            billableDays: "2",
            periodEnd: "2026-09-04",
            periodStart: "2026-09-04",
          },
        ],
      },
      issuer: completeIssuer,
      today: businessDate,
    });

    expect(review.formattedTotals).toBeNull();
    expect(review.totals).toBeNull();
    expect(review.errors).toContainEqual({
      location: { kind: "service-line", serviceLineIndex: 0, fieldName: "billableDays" },
      message: "Billable days cannot exceed the 1 day in the service period.",
    });
  });
});

function createOutsideScopeDraft(client: typeof completeClient) {
  const draft = createInvoiceDraft(client);
  if (draft.vatTreatment !== "outside-scope") throw new Error("Expected outside-scope draft");
  return draft;
}
