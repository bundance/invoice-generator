import { describe, expect, it } from "vite-plus/test";

import { findCurrency } from "../money/currency.ts";
import {
  reviewInvoiceServiceLines,
  reverseIssuedInvoiceServiceLines,
  summarizeServiceLines,
} from "./invoice-service-line.ts";

const gbp = findCurrency("GBP");

if (!gbp) throw new Error("GBP must be available");

describe("invoice service lines", () => {
  it("keeps the current one-line taxable calculation", () => {
    const review = reviewInvoiceServiceLines({
      currency: gbp,
      kind: "uk-taxable",
      serviceLines: [
        {
          billableDays: "4",
          dayRate: "725",
          periodEnd: "2026-09-05",
          periodStart: "2026-09-02",
          serviceDescription: "Software development",
          vatRate: "20",
        },
      ],
    });

    expect(review).toMatchObject({
      earliestPeriodStart: "2026-09-02",
      errors: [],
      latestPeriodEnd: "2026-09-05",
      serviceLines: [
        {
          billableDays: "4",
          dayRate: "725",
          periodEnd: "2026-09-05",
          periodStart: "2026-09-02",
          serviceDescription: "Software development",
          totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
          vatRate: "20",
        },
      ],
      totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
    });
  });

  it("rounds each line before summing invoice totals", () => {
    const review = reviewInvoiceServiceLines({
      currency: gbp,
      kind: "uk-taxable",
      serviceLines: [
        {
          billableDays: "0.25",
          dayRate: "0.02",
          periodEnd: "2026-09-01",
          periodStart: "2026-09-01",
          serviceDescription: "First service",
          vatRate: "20",
        },
        {
          billableDays: "0.25",
          dayRate: "0.02",
          periodEnd: "2026-09-03",
          periodStart: "2026-09-02",
          serviceDescription: "Second service",
          vatRate: "10",
        },
      ],
    });

    expect(review.serviceLines?.map(({ totals }) => totals)).toEqual([
      { gross: "0.01", net: "0.01", vat: "0.00" },
      { gross: "0.01", net: "0.01", vat: "0.00" },
    ]);
    expect(review.totals).toEqual({ gross: "0.02", net: "0.02", vat: "0.00" });
    expect(review.earliestPeriodStart).toBe("2026-09-01");
    expect(review.latestPeriodEnd).toBe("2026-09-03");
  });

  it("returns exact indexed field errors for invalid lines", () => {
    const review = reviewInvoiceServiceLines({
      currency: gbp,
      kind: "uk-taxable",
      serviceLines: [
        {
          billableDays: "1",
          dayRate: "725",
          periodEnd: "2026-09-01",
          periodStart: "2026-09-01",
          serviceDescription: "Valid service",
          vatRate: "20",
        },
        {
          billableDays: "2",
          dayRate: "725.001",
          periodEnd: "2026-09-02",
          periodStart: "2026-09-02",
          serviceDescription: "",
          vatRate: "0",
        },
      ],
    });

    expect(review.serviceLines).toBeNull();
    expect(review.errors).toEqual(
      expect.arrayContaining([
        {
          fieldName: "serviceDescription",
          message: "Enter the service description.",
          serviceLineIndex: 1,
        },
        {
          fieldName: "dayRate",
          message: "Use no more than 2 decimal places for GBP.",
          serviceLineIndex: 1,
        },
        {
          fieldName: "billableDays",
          message: "Billable days cannot exceed the 1 day in the service period.",
          serviceLineIndex: 1,
        },
        {
          fieldName: "vatRate",
          message: "Enter a VAT rate greater than zero.",
          serviceLineIndex: 1,
        },
      ]),
    );
  });

  it("previews formatted money totals while non-money fields are incomplete", () => {
    const review = reviewInvoiceServiceLines({
      currency: gbp,
      kind: "outside-scope",
      serviceLines: [
        {
          billableDays: "5",
          dayRate: "725",
          periodEnd: "",
          periodStart: "",
          serviceDescription: "",
        },
      ],
    });

    expect(review.serviceLines).toBeNull();
    expect(review.totals).toEqual({ gross: "3625.00", net: "3625.00", vat: "0.00" });
    expect(review.previews[0]).toMatchObject({
      formattedTotals: {
        gross: "£3,625.00",
        net: "£3,625.00",
        vat: "£0.00",
      },
      totals: { gross: "3625.00", net: "3625.00", vat: "0.00" },
    });
  });

  it("creates outside-scope lines without a VAT rate", () => {
    const review = reviewInvoiceServiceLines({
      currency: gbp,
      kind: "outside-scope",
      serviceLines: [
        {
          billableDays: "1",
          dayRate: "725",
          periodEnd: "2026-09-01",
          periodStart: "2026-09-01",
          serviceDescription: "Outside-scope service",
        },
      ],
    });

    expect(review.serviceLines).toEqual([
      {
        billableDays: "1",
        dayRate: "725",
        periodEnd: "2026-09-01",
        periodStart: "2026-09-01",
        serviceDescription: "Outside-scope service",
        totals: { gross: "725.00", net: "725.00", vat: "0.00" },
      },
    ]);
  });

  it("reverses stored service lines without recalculation", () => {
    expect(
      reverseIssuedInvoiceServiceLines([
        {
          billableDays: "0.25",
          dayRate: "0.02",
          periodEnd: "2026-09-01",
          periodStart: "2026-09-01",
          serviceDescription: "Rounded service",
          totals: { gross: "0.01", net: "0.01", vat: "0.00" },
          vatRate: "20",
        },
      ]),
    ).toEqual([
      {
        billableDays: "-0.25",
        dayRate: "0.02",
        periodEnd: "2026-09-01",
        periodStart: "2026-09-01",
        serviceDescription: "Rounded service",
        totals: { gross: "-0.01", net: "-0.01", vat: "0.00" },
        vatRate: "20",
      },
    ]);
  });

  it("summarizes period bounds and VAT rates in first-seen order", () => {
    const totals = { gross: "120.00", net: "100.00", vat: "20.00" };

    expect(
      summarizeServiceLines([
        {
          billableDays: "1",
          dayRate: "100",
          periodEnd: "2026-09-06",
          periodStart: "2026-09-04",
          serviceDescription: "First service",
          totals,
          vatRate: "20",
        },
        {
          billableDays: "1",
          dayRate: "100",
          periodEnd: "2026-09-03",
          periodStart: "2026-09-02",
          serviceDescription: "Second service",
          totals,
          vatRate: "5",
        },
        {
          billableDays: "1",
          dayRate: "100",
          periodEnd: "2026-09-08",
          periodStart: "2026-09-07",
          serviceDescription: "Third service",
          totals,
          vatRate: "20",
        },
      ]),
    ).toEqual({
      periodEnd: "2026-09-08",
      periodStart: "2026-09-02",
      vatRates: ["20", "5"],
    });
  });

  it("summarizes outside-scope lines without inventing VAT rates", () => {
    expect(
      summarizeServiceLines([
        {
          billableDays: "1",
          dayRate: "100",
          periodEnd: "2026-09-02",
          periodStart: "2026-09-02",
          serviceDescription: "Outside-scope service",
          totals: { gross: "100.00", net: "100.00", vat: "0.00" },
        },
      ]),
    ).toEqual({
      periodEnd: "2026-09-02",
      periodStart: "2026-09-02",
      vatRates: [],
    });
  });
});
