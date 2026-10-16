// @vitest-environment node

import { Font } from "@react-pdf/renderer";
import { describe, expect, it } from "vite-plus/test";

import { completeClient } from "../../../tests/fixtures/client.ts";
import {
  completeInvoiceDraftInput,
  completeIssuedInvoice,
} from "../../../tests/fixtures/issued-invoice.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";
import { reviewFullCreditNote } from "../../domain/invoices/credit-note.ts";
import { reviewInvoiceDraft } from "../../domain/invoices/invoice-draft.ts";
import { parseBusinessDate } from "../../domain/time/business-date.ts";
import { createCreditNotePdf, createInvoicePdf } from "./invoice-pdf.ts";

describe("billing PDF layout checks", () => {
  it("reports actual invoice and credit-note layout violations as invalid", async () => {
    const invoice = invoiceCandidate();
    const credit = creditNoteCandidate("W".repeat(300));
    expect(
      await createInvoicePdf().checkLayout({ ...invoice, paymentTerms: "W".repeat(200) }),
    ).toBe(false);
    expect(await createCreditNotePdf().checkLayout(credit)).toBe(false);
  });

  it("propagates unexpected renderer errors for both document types", async () => {
    const originalHyphenation = Font.getHyphenationCallback();
    const engineFailure = new Error("The font text processor failed");
    Font.registerHyphenationCallback(() => {
      throw engineFailure;
    });
    try {
      await expect(createInvoicePdf().checkLayout(invoiceCandidate())).rejects.toBe(engineFailure);
      await expect(createCreditNotePdf().checkLayout(creditNoteCandidate())).rejects.toBe(
        engineFailure,
      );
    } finally {
      Font.hyphenationCallback = originalHyphenation;
    }
  });
});

function invoiceCandidate() {
  const review = reviewInvoiceDraft({
    client: completeClient,
    draft: completeInvoiceDraftInput,
    issuer: completeIssuer,
    today: parseBusinessDate("2026-09-04"),
  });
  if (!review.candidate) throw new Error("Expected an invoice candidate");
  return review.candidate;
}

function creditNoteCandidate(reason = "The service period was incorrect.") {
  const review = reviewFullCreditNote({
    input: {
      originalInvoiceId: completeIssuedInvoice.id,
      issueDate: "2026-09-07",
      reason,
    },
    invoice: completeIssuedInvoice,
    today: parseBusinessDate("2026-09-07"),
  });
  if (review.kind !== "ready") throw new Error("Expected a credit-note candidate");
  return review.candidate;
}
