import { describe, expect, it } from "vite-plus/test";

import {
  completeForeignCurrencyVatIssuedInvoice,
  completeIssuedInvoice,
} from "../../../tests/fixtures/issued-invoice.js";
import { parseBusinessDate } from "../time/business-date.js";
import { createFullCreditNoteSnapshot, reviewFullCreditNote } from "./credit-note.js";
import { persistedIssuedInvoiceSchema } from "./issued-invoice.js";

describe("full credit note", () => {
  it("copies an outside-scope invoice and exactly negates its stored values", () => {
    const review = reviewFullCreditNote({
      input: {
        issueDate: "2026-09-07",
        originalInvoiceId: completeIssuedInvoice.id,
        reason: "  The billed service period was incorrect.  ",
      },
      invoice: completeIssuedInvoice,
      today: parseBusinessDate("2026-09-07"),
    });
    if (review.kind !== "ready") throw new Error("Expected a ready credit-note review");
    const creditNote = createFullCreditNoteSnapshot({
      candidate: review.candidate,
      issuedAt: "2026-09-07T10:11:12.000Z",
    });

    expect(creditNote).toMatchObject({
      client: completeIssuedInvoice.client,
      currency: completeIssuedInvoice.currency,
      id: "CN-GGIOHK-0043",
      originalInvoiceId: "GGIOHK-0043",
      originalIssueDate: "2026-09-04",
      reason: "The billed service period was incorrect.",
      serviceLines: [
        {
          billableDays: "-4",
          dayRate: completeIssuedInvoice.serviceLines[0]?.dayRate,
          totals: { gross: "-2900.00", net: "-2900.00", vat: "0.00" },
        },
      ],
      taxFacts: completeIssuedInvoice.taxFacts,
      totals: { gross: "-2900.00", net: "-2900.00", vat: "0.00" },
    });
  });

  it("negates stored foreign-currency and sterling totals without recalculating them", () => {
    const review = reviewFullCreditNote({
      input: {
        issueDate: "2026-09-07",
        originalInvoiceId: completeForeignCurrencyVatIssuedInvoice.id,
        reason: "The client legal name was wrong.",
      },
      invoice: completeForeignCurrencyVatIssuedInvoice,
      today: parseBusinessDate("2026-09-07"),
    });

    expect(review).toMatchObject({
      kind: "ready",
      candidate: {
        taxFacts: {
          kind: "foreign-currency-uk-vat",
          sterlingVatSummary: {
            exchangeRecord:
              completeForeignCurrencyVatIssuedInvoice.taxFacts.kind === "foreign-currency-uk-vat"
                ? completeForeignCurrencyVatIssuedInvoice.taxFacts.sterlingVatSummary.exchangeRecord
                : undefined,
            totals: { gross: "-2784.00", net: "-2320.00", vat: "-464.00" },
          },
        },
        totals: { gross: "-3480.00", net: "-2900.00", vat: "-580.00" },
      },
    });
  });

  it("credits client-currency totals that have no minor units", () => {
    const jpyInvoice = persistedIssuedInvoiceSchema.parse({
      ...completeIssuedInvoice,
      currency: { code: "JPY", minorUnit: 0, name: "Yen" },
      serviceLines: [
        {
          ...completeIssuedInvoice.serviceLines[0],
          dayRate: "725",
          totals: { gross: "2900", net: "2900", vat: "0" },
        },
      ],
      totals: { gross: "2900", net: "2900", vat: "0" },
    });

    expect(
      reviewFullCreditNote({
        input: {
          issueDate: "2026-09-07",
          originalInvoiceId: jpyInvoice.id,
          reason: "The billed service period was incorrect.",
        },
        invoice: jpyInvoice,
        today: parseBusinessDate("2026-09-07"),
      }),
    ).toMatchObject({
      kind: "ready",
      candidate: { totals: { gross: "-2900", net: "-2900", vat: "0" } },
    });
  });

  it("credits non-zero client-currency totals below one unit", () => {
    const smallInvoice = persistedIssuedInvoiceSchema.parse({
      ...completeIssuedInvoice,
      serviceLines: [
        {
          ...completeIssuedInvoice.serviceLines[0],
          billableDays: "0.25",
          dayRate: "0.04",
          totals: { gross: "0.01", net: "0.01", vat: "0.00" },
        },
      ],
      totals: { gross: "0.01", net: "0.01", vat: "0.00" },
    });

    expect(
      reviewFullCreditNote({
        input: {
          issueDate: "2026-09-07",
          originalInvoiceId: smallInvoice.id,
          reason: "The billed service period was incorrect.",
        },
        invoice: smallInvoice,
        today: parseBusinessDate("2026-09-07"),
      }),
    ).toMatchObject({
      kind: "ready",
      candidate: { totals: { gross: "-0.01", net: "-0.01", vat: "0.00" } },
    });
  });

  it("credits non-zero sterling VAT totals below one pound", () => {
    const smallForeignCurrencyInvoice = persistedIssuedInvoiceSchema.parse({
      ...completeForeignCurrencyVatIssuedInvoice,
      currency: { code: "JPY", minorUnit: 0, name: "Yen" },
      serviceLines: [
        {
          ...completeForeignCurrencyVatIssuedInvoice.serviceLines[0],
          billableDays: "0.25",
          dayRate: "3",
          totals: { gross: "1", net: "1", vat: "0" },
        },
      ],
      taxFacts: {
        ...completeForeignCurrencyVatIssuedInvoice.taxFacts,
        sterlingVatSummary: {
          exchangeRecord: {
            effectiveDate: "2026-09-05",
            evidenceReference: "HMRC monthly exchange rates, September 2026",
            method: "hmrc-period-rate",
            rate: "3",
          },
          totalsByRate: [
            {
              clientCurrencyNet: "1",
              sterlingTotals: { gross: "0.40", net: "0.33", vat: "0.07" },
              vatRate: "20",
            },
          ],
          totals: { gross: "0.40", net: "0.33", vat: "0.07" },
        },
      },
      totals: { gross: "1", net: "1", vat: "0" },
    });

    expect(
      reviewFullCreditNote({
        input: {
          issueDate: "2026-09-07",
          originalInvoiceId: smallForeignCurrencyInvoice.id,
          reason: "The billed service period was incorrect.",
        },
        invoice: smallForeignCurrencyInvoice,
        today: parseBusinessDate("2026-09-07"),
      }),
    ).toMatchObject({
      kind: "ready",
      candidate: {
        taxFacts: {
          sterlingVatSummary: {
            totals: { gross: "-0.40", net: "-0.33", vat: "-0.07" },
          },
        },
      },
    });
  });

  it.each([
    ["", "2026-09-07"],
    ["Bad debt", "2026-09-07"],
    ["Bad date", "2026-09-03"],
    ["Future date", "2026-09-08"],
  ])("rejects an invalid reason or date before a snapshot exists", (reason, issueDate) => {
    expect(
      reviewFullCreditNote({
        input: { issueDate, originalInvoiceId: completeIssuedInvoice.id, reason },
        invoice: completeIssuedInvoice,
        today: parseBusinessDate("2026-09-07"),
      }),
    ).toEqual({ kind: "invalid", message: expect.any(String) });
  });
});
