import { describe, expect, it } from "vite-plus/test";

import { completeGbpVatClient, completeGbpVatClientInput } from "../../../tests/fixtures/client.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";
import { persistedClientSchema, type Client } from "../clients/client.ts";
import { parseBusinessDate } from "../time/business-date.ts";
import { createInvoiceDraft, reviewInvoiceDraft } from "./invoice-draft.ts";

const today = parseBusinessDate("2026-09-06");

describe("GBP UK VAT invoice draft", () => {
  it("copies UK VAT defaults and builds an exact candidate without consuming a number", () => {
    const draft = {
      ...createUkTaxableInvoiceDraft(completeGbpVatClient),
      issueDate: "2026-09-06",
      serviceLines: [
        {
          ...createUkTaxableInvoiceDraft(completeGbpVatClient).serviceLines[0],
          billableDays: "4",
          periodEnd: "2026-09-05",
          periodStart: "2026-09-02",
        },
      ] as const,
      taxPoint: "2026-09-05",
    };

    const review = reviewInvoiceDraft({
      client: completeGbpVatClient,
      draft,
      issuer: completeIssuer,
      today,
    });

    expect(draft).toMatchObject({
      taxPoint: "2026-09-05",
      serviceLines: [{ vatRate: "20" }],
      vatTreatment: "uk-taxable",
    });
    expect(review).toMatchObject({
      candidate: {
        proposedInvoiceId: "ACME-0008",
        totals: { gross: "3480.00", net: "2900.00", vat: "580.00" },
        taxFacts: {
          kind: "gbp-uk-vat",
          vatTreatment: {
            kind: "uk-taxable",
            taxPoint: "2026-09-05",
            wording: "UK VAT applies.",
          },
        },
      },
      errors: [],
      formattedTotals: {
        gross: "£3,480.00",
        net: "£2,900.00",
        vat: "£580.00",
      },
      preview: {
        serviceLines: [{ vatRate: "20" }],
        taxPoint: "2026-09-05",
        vatWording: "UK VAT applies.",
      },
    });
    expect(completeGbpVatClient.invoiceSequence.nextNumber).toBe("8");
  });

  it.each([
    ["missing VAT rate", { vatRate: "" }, "vatRate", "Enter a VAT rate"],
    ["zero VAT rate", { vatRate: "0" }, "vatRate", "greater than zero"],
    ["VAT rate above 100", { vatRate: "100.001" }, "vatRate", "no greater than 100"],
    ["too precise VAT rate", { vatRate: "20.0001" }, "vatRate", "three decimal places"],
    ["missing tax point", { taxPoint: "" }, "taxPoint", "Enter the tax point"],
    [
      "tax point before service completion",
      { taxPoint: "2026-09-01" },
      "taxPoint",
      "cannot precede the latest period end",
    ],
    [
      "tax point after issue",
      { taxPoint: "2026-09-07" },
      "taxPoint",
      "cannot follow the issue date",
    ],
  ] as const)("rejects %s", (_name, changedFields, fieldName, message) => {
    const baseDraft = createUkTaxableInvoiceDraft(completeGbpVatClient);
    const vatRate = "vatRate" in changedFields ? changedFields.vatRate : "20";
    const invoiceChanges = "taxPoint" in changedFields ? changedFields : {};
    const review = reviewInvoiceDraft({
      client: completeGbpVatClient,
      draft: {
        ...baseDraft,
        issueDate: "2026-09-06",
        serviceLines: [
          {
            ...baseDraft.serviceLines[0],
            billableDays: "1",
            periodEnd: "2026-09-05",
            periodStart: "2026-09-05",
            vatRate,
          },
        ],
        taxPoint: "2026-09-05",
        ...invoiceChanges,
      },
      issuer: completeIssuer,
      today,
    });

    expect(review.candidate).toBeNull();
    expect(review.errors).toContainEqual({
      location:
        fieldName === "vatRate"
          ? { fieldName, kind: "service-line", serviceLineIndex: 0 }
          : { fieldName, kind: "invoice" },
      message: expect.stringContaining(message),
    });
  });

  it("requires complete exchange evidence for a foreign-currency UK VAT draft", () => {
    const foreignCurrencyClient = persistedClientSchema.parse({
      ...completeGbpVatClient,
      currency: { code: "USD", minorUnit: 2, name: "US Dollar" },
    });
    const review = reviewInvoiceDraft({
      client: foreignCurrencyClient,
      draft: {
        ...createUkTaxableInvoiceDraft(foreignCurrencyClient),
        issueDate: "2026-09-06",
        serviceLines: [
          {
            ...createUkTaxableInvoiceDraft(foreignCurrencyClient).serviceLines[0],
            billableDays: "1",
            periodEnd: "2026-09-05",
            periodStart: "2026-09-05",
          },
        ],
        taxPoint: "2026-09-05",
      },
      issuer: completeIssuer,
      today,
    });

    expect(review.candidate).toBeNull();
    expect(review.errors).toEqual(
      expect.arrayContaining([
        {
          location: { fieldName: "exchangeRate", kind: "invoice" },
          message: "Enter a positive exchange rate.",
        },
        {
          location: { fieldName: "exchangeEvidenceReference", kind: "invoice" },
          message: "Enter an exchange-rate evidence reference.",
        },
      ]),
    );
    expect(completeGbpVatClientInput.vatTreatment).toBe("uk-taxable");
  });
});

function createUkTaxableInvoiceDraft(client: Client) {
  const draft = createInvoiceDraft(client);
  if (draft.vatTreatment !== "uk-taxable") {
    throw new Error("Expected a UK-taxable invoice draft");
  }
  return draft;
}
