import { describe, expect, it } from "vite-plus/test";

import { calculateInvoiceTotals, type InvoiceTotalTreatment } from "./invoice-policy.ts";

describe("invoice totals", () => {
  it.each([
    {
      billableDays: "0.25",
      dayRate: "0.02",
      expected: { gross: "0.01", net: "0.01", vat: "0.00" },
      treatment: { kind: "uk-taxable", rate: "20" } as const,
    },
    {
      billableDays: "1",
      dayRate: "0.05",
      expected: { gross: "0.06", net: "0.05", vat: "0.01" },
      treatment: { kind: "uk-taxable", rate: "10" } as const,
    },
    {
      billableDays: "1",
      dayRate: "0.04",
      expected: { gross: "0.04", net: "0.04", vat: "0.00" },
      treatment: { kind: "uk-taxable", rate: "10" } as const,
    },
    {
      billableDays: "0.25",
      dayRate: "9007199254740993.00",
      expected: {
        gross: "2702159776422297.90",
        net: "2251799813685248.25",
        vat: "450359962737049.65",
      },
      treatment: { kind: "uk-taxable", rate: "20" } as const,
    },
    {
      billableDays: "0.25",
      dayRate: "0.02",
      expected: { gross: "0.01", net: "0.01", vat: "0.00" },
      treatment: { kind: "outside-scope" } as const,
    },
  ] satisfies readonly {
    billableDays: string;
    dayRate: string;
    expected: Readonly<{ gross: string; net: string; vat: string }>;
    treatment: InvoiceTotalTreatment;
  }[])(
    "rounds exact $treatment.kind totals for $billableDays x $dayRate",
    ({ billableDays, dayRate, expected, treatment }) => {
      expect(calculateInvoiceTotals({ billableDays, dayRate, minorUnit: 2, treatment })).toEqual(
        expected,
      );
    },
  );
});
