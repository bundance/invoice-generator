import { describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../clients/client.ts";
import { parseBusinessDate } from "../time/business-date.ts";
import { createInvoiceDraft, type InvoiceDraftInput, reviewInvoiceDraft } from "./invoice-draft.ts";
import { completeGbpVatClient } from "../../../tests/fixtures/client.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";

describe("foreign-currency UK VAT invoice draft", () => {
  it("requires exchange evidence and calculates an independent sterling VAT summary", () => {
    const review = reviewForeignCurrencyDraft({ currencyCode: "USD", dayRate: "725" });

    expect(review).toMatchObject({
      candidate: {
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
      },
      errors: [],
    });
  });

  it.each([
    {
      currency: { code: "JPY", minorUnit: 0, name: "Yen" },
      dayRate: "3",
      exchangeRate: "3",
      expectedClientTotals: { gross: "1", net: "1", vat: "0" },
      expectedSterlingTotals: { gross: "0.40", net: "0.33", vat: "0.07" },
    },
    {
      currency: { code: "USD", minorUnit: 2, name: "US Dollar" },
      dayRate: "0.06",
      exchangeRate: "0.03",
      expectedClientTotals: { gross: "0.02", net: "0.02", vat: "0.00" },
      expectedSterlingTotals: { gross: "0.80", net: "0.67", vat: "0.13" },
    },
    {
      currency: { code: "BHD", minorUnit: 3, name: "Bahraini Dinar" },
      dayRate: "0.006",
      exchangeRate: "0.003",
      expectedClientTotals: { gross: "0.002", net: "0.002", vat: "0.000" },
      expectedSterlingTotals: { gross: "0.80", net: "0.67", vat: "0.13" },
    },
  ])(
    "rounds $currency.code and sterling VAT independently",
    ({ currency, dayRate, exchangeRate, expectedClientTotals, expectedSterlingTotals }) => {
      const review = reviewForeignCurrencyDraft({
        billableDays: "0.25",
        currencyCode: currency.code,
        currencyName: currency.name,
        dayRate,
        exchangeRate,
        minorUnit: currency.minorUnit,
      });

      expect(review.errors).toEqual([]);
      expect(review.totals).toEqual(expectedClientTotals);
      expect(review.candidate?.taxFacts).toMatchObject({
        kind: "foreign-currency-uk-vat",
        sterlingVatSummary: { totals: expectedSterlingTotals },
      });
    },
  );

  it.each([
    ["rate", "exchangeRate", "", "Enter a positive exchange rate."],
    ["rate", "exchangeRate", "0", "Enter a positive exchange rate."],
    ["rate", "exchangeRate", "-1", "Enter a positive exchange rate."],
    ["rate", "exchangeRate", "1.2.3", "Enter a positive exchange rate."],
    ["rate", "exchangeRate", "1234567890123", "Use at most 12 significant digits."],
    ["effectiveDate", "exchangeEffectiveDate", "", "Enter the exchange-rate effective date."],
    ["effectiveDate", "exchangeEffectiveDate", "2026-02-30", "Enter a real calendar date."],
    ["method", "exchangeMethod", "", "Choose an approved exchange-rate method."],
    ["method", "exchangeMethod", "bank-rate", "Choose an approved exchange-rate method."],
    [
      "evidenceReference",
      "exchangeEvidenceReference",
      "",
      "Enter an exchange-rate evidence reference.",
    ],
  ] satisfies readonly (readonly [
    keyof RequiredExchangeDraft,
    ExchangeErrorField,
    string,
    string,
  ])[])("rejects invalid or missing %s evidence", (inputName, fieldName, value, message) => {
    const review = reviewForeignCurrencyDraft({ exchangeFields: { [inputName]: value } });

    expect(review.candidate).toBeNull();
    expect(review.errors).toContainEqual({
      location: { fieldName, kind: "invoice" },
      message,
    });
  });

  it("accepts an HMRC period rate dated within the tax point month", () => {
    const review = reviewForeignCurrencyDraft({
      exchangeFields: { effectiveDate: "2026-09-01" },
    });

    expect(review.errors).toEqual([]);
    expect(review.candidate).not.toBeNull();
  });

  it("rejects a rate whose calculated sterling totals cannot be persisted", () => {
    const review = reviewForeignCurrencyDraft({ exchangeRate: `0.${"0".repeat(197)}1` });

    expect(review.candidate).toBeNull();
    expect(review.errors).toContainEqual({
      location: { fieldName: "exchangeRate", kind: "invoice" },
      message: "Use an exchange rate that produces storable sterling totals.",
    });
  });

  it("rejects an HMRC period rate from a different tax point month", () => {
    const review = reviewForeignCurrencyDraft({
      exchangeFields: { effectiveDate: "2026-08-31" },
    });

    expect(review.candidate).toBeNull();
    expect(review.errors).toContainEqual({
      location: { fieldName: "exchangeEffectiveDate", kind: "invoice" },
      message: "The HMRC period rate must cover the tax point month.",
    });
  });

  it.each(["uk-market-selling-rate", "other-hmrc-approved-method"] as const)(
    "requires %s evidence dated at the tax point",
    (method) => {
      const review = reviewForeignCurrencyDraft({
        exchangeFields: { effectiveDate: "2026-09-04", method },
      });

      expect(review.candidate).toBeNull();
      expect(review.errors).toContainEqual({
        location: { fieldName: "exchangeEffectiveDate", kind: "invoice" },
        message: "The exchange-rate date must match the tax point for this method.",
      });
    },
  );
});

type ForeignCurrencyVatDraft = Extract<InvoiceDraftInput, { vatTreatment: "uk-taxable" }>;
type RequiredExchangeDraft = Extract<ForeignCurrencyVatDraft["exchange"], { kind: "required" }>;
type ExchangeErrorField =
  | "exchangeEffectiveDate"
  | "exchangeEvidenceReference"
  | "exchangeMethod"
  | "exchangeRate";

type ReviewForeignCurrencyDraftOptions = Readonly<{
  billableDays?: string;
  currencyCode?: string;
  currencyName?: string;
  dayRate?: string;
  draftFields?: Partial<Omit<ForeignCurrencyVatDraft, "exchange">>;
  exchangeFields?: Partial<RequiredExchangeDraft>;
  exchangeRate?: string;
  minorUnit?: number;
}>;

function reviewForeignCurrencyDraft({
  billableDays = "4",
  currencyCode = "USD",
  currencyName = "US Dollar",
  dayRate = "725",
  draftFields = {},
  exchangeFields = {},
  exchangeRate = "1.25",
  minorUnit = 2,
}: ReviewForeignCurrencyDraftOptions) {
  const client = persistedClientSchema.parse({
    ...completeGbpVatClient,
    currency: { code: currencyCode, minorUnit, name: currencyName },
    standardDayRate: dayRate,
  });
  const draft = createInvoiceDraft(client);
  if (draft.vatTreatment !== "uk-taxable" || draft.exchange.kind !== "required") {
    throw new Error("Expected a foreign-currency UK-taxable invoice draft");
  }

  return reviewInvoiceDraft({
    client,
    draft: {
      ...draft,
      exchange: {
        ...draft.exchange,
        effectiveDate: "2026-09-05",
        evidenceReference: "HMRC monthly exchange rates, September 2026",
        method: "hmrc-period-rate",
        rate: exchangeRate,
        ...exchangeFields,
      },
      issueDate: "2026-09-06",
      serviceLines: [
        {
          ...draft.serviceLines[0],
          billableDays,
          dayRate,
          periodEnd: "2026-09-05",
          periodStart: "2026-09-02",
        },
      ],
      taxPoint: "2026-09-05",
      ...draftFields,
    },
    issuer: completeIssuer,
    today: parseBusinessDate("2026-09-06"),
  });
}
