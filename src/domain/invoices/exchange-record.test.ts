import { describe, expect, it } from "vite-plus/test";

import {
  createSterlingVatSummary,
  persistedExchangeRecordSchema,
  sterlingVatSummaryErrors,
} from "./exchange-record.ts";

const exchangeRecord = persistedExchangeRecordSchema.parse({
  effectiveDate: "2026-09-05",
  evidenceReference: "HMRC monthly exchange rates, September 2026",
  method: "hmrc-period-rate",
  rate: "1.25",
});

const serviceLines = [
  {
    billableDays: "1",
    dayRate: "100",
    periodEnd: "2026-09-05",
    periodStart: "2026-09-05",
    serviceDescription: "Standard-rated service",
    totals: { gross: "120.00", net: "100.00", vat: "20.00" },
    vatRate: "20",
  },
  {
    billableDays: "1",
    dayRate: "50",
    periodEnd: "2026-09-05",
    periodStart: "2026-09-05",
    serviceDescription: "Reduced-rated service",
    totals: { gross: "52.50", net: "50.00", vat: "2.50" },
    vatRate: "5",
  },
  {
    billableDays: "1",
    dayRate: "25",
    periodEnd: "2026-09-05",
    periodStart: "2026-09-05",
    serviceDescription: "Second standard-rated service",
    totals: { gross: "30.00", net: "25.00", vat: "5.00" },
    vatRate: "20",
  },
] as const;

describe("sterling VAT-rate summary", () => {
  it("groups client-currency net by VAT rate before converting each bucket once", () => {
    const summary = createSterlingVatSummary({
      clientCurrencyMinorUnit: 2,
      exchangeRecord,
      serviceLines,
    });

    expect(summary.totalsByRate).toEqual([
      {
        clientCurrencyNet: "125.00",
        sterlingTotals: { gross: "120.00", net: "100.00", vat: "20.00" },
        vatRate: "20",
      },
      {
        clientCurrencyNet: "50.00",
        sterlingTotals: { gross: "42.00", net: "40.00", vat: "2.00" },
        vatRate: "5",
      },
    ]);
    expect(summary.totals).toEqual({ gross: "162.00", net: "140.00", vat: "22.00" });
  });

  it("detects a stored VAT-rate bucket that no longer matches its service lines", () => {
    const summary = createSterlingVatSummary({
      clientCurrencyMinorUnit: 2,
      exchangeRecord,
      serviceLines,
    });
    const [firstBucket, secondBucket] = summary.totalsByRate;
    if (!firstBucket || !secondBucket) throw new Error("Expected two VAT-rate buckets");

    expect(
      sterlingVatSummaryErrors({
        clientCurrencyMinorUnit: 2,
        serviceLines,
        summary: {
          ...summary,
          totalsByRate: [{ ...firstBucket, clientCurrencyNet: "124.00" }, secondBucket],
        },
        taxPoint: "2026-09-05",
      }),
    ).toContainEqual({
      message: "The immutable sterling VAT-rate totals do not match the invoice calculation.",
      path: ["totalsByRate"],
    });
  });
});
