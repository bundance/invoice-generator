// @vitest-environment node

import { describe, expect, it } from "vite-plus/test";

import {
  createCreditNoteDocumentModel,
  createDraftInvoiceDocumentModel,
  createIssuedInvoiceDocumentModel,
  type BillingDocumentModel,
} from "../../documents/invoice-document-model.ts";
import { readUsedPdfTextFontNames } from "../../documents/pdf-font-report.ts";
import { createInvoiceDraft, reviewInvoiceDraft } from "../../domain/invoices/invoice-draft.ts";
import { persistedIssuerSettingsSchema } from "../../domain/issuer/issuer-settings.ts";
import { parseBusinessDate } from "../../domain/time/business-date.ts";
import {
  completeClient,
  completeForeignCurrencyVatClient,
} from "../../../tests/fixtures/client.ts";
import {
  completeCreditNote,
  completeForeignCurrencyVatCreditNote,
  completeForeignCurrencyVatInvoiceDraftInput,
  completeForeignCurrencyVatIssuedInvoice,
  completeIssuedInvoice,
} from "../../../tests/fixtures/issued-invoice.ts";
import { completeIssuer } from "../../../tests/fixtures/issuer-settings.ts";
import { renderBillingPdf } from "./billing-pdf-engine.tsx";

describe("billing PDF engine", () => {
  it("renders a complete A4 PDF with selectable document text", async () => {
    const result = await renderBillingPdf(createIssuedInvoiceDocumentModel(completeIssuedInvoice));
    const text = await readPdfText(result.bytes);
    const pages = await readPdfPageEvidence(result.bytes);

    expect(Buffer.from(result.bytes.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    expect(result.pageCount).toBe(1);
    expect(text).toContain("INVOICE GGIOHK-0043");
    expect(text).toContain("Page 1 of 1");
    expect(text).toContain("Genesis Global");
    expect(text).toContain("USD 2,900.00");
    expect(Buffer.from(result.bytes).includes(Buffer.from("Arimo"))).toBe(true);
    expect(pages).toEqual([
      expect.objectContaining({ hasImage: true, textLength: expect.any(Number) }),
    ]);
    expect(pages[0]?.textLength).toBeGreaterThan(100);
  });

  it("renders incomplete draft placeholders for the live preview", async () => {
    const draft = createInvoiceDraft(completeClient);
    const review = reviewInvoiceDraft({
      client: completeClient,
      draft,
      issuer: completeIssuer,
      today: parseBusinessDate("2026-09-04"),
    });

    const result = await renderBillingPdf(createDraftInvoiceDocumentModel(completeIssuer, review));
    const text = await readPdfText(result.bytes);

    expect(result.pageCount).toBe(1);
    expect(text).toContain("DRAFT INVOICE");
    expect(text).toContain("Date not entered");
    expect(text).toContain("Unavailable");
  });

  it("paginates ordinary service rows and preserves every row in order", async () => {
    const baseModel = createIssuedInvoiceDocumentModel(completeIssuedInvoice);
    const model = {
      ...baseModel,
      serviceLines: Array.from({ length: 30 }, (_, index) => ({
        ...requireServiceLine(baseModel),
        renderKey: `line-${index}`,
        serviceDescription: `Ordered service ${index + 1}`,
      })),
    } satisfies BillingDocumentModel;

    const result = await renderBillingPdf(model);
    const text = await readPdfText(result.bytes);
    const pages = await readPdfPageEvidence(result.bytes);

    expect(result.pageCount).toBe(3);
    expect(text.match(/Ordered service/gu)).toHaveLength(30);
    expect(text.match(/TOTAL/gu)).toHaveLength(1);
    expect(text.indexOf("Ordered service 1")).toBeLessThan(text.indexOf("Ordered service 30"));
    expect(pages).toHaveLength(3);
    for (const [index, page] of pages.entries())
      expect(page.text).toContain(`Page ${index + 1} of 3`);
    expect(pages.every(({ hasImage, textLength }) => hasImage && textLength > 0)).toBe(true);
    expect(pages.every(({ text: pageText }) => pageText.includes("INVOICE GGIOHK-0043"))).toBe(
      true,
    );
  });

  it("rejects one indivisible service row that is taller than an A4 page", async () => {
    const baseModel = createIssuedInvoiceDocumentModel(completeIssuedInvoice);
    const model = {
      ...baseModel,
      serviceLines: [
        {
          ...requireServiceLine(baseModel),
          serviceDescription: Array.from({ length: 300 }, () => "oversized service row").join(" "),
        },
      ],
    } satisfies BillingDocumentModel;

    await expect(renderBillingPdf(model)).rejects.toThrow(/clipped .* text inside/u);
  });

  it("rejects an amount whose glyph advance is wider than its table column", async () => {
    const baseModel = createIssuedInvoiceDocumentModel(completeIssuedInvoice);
    const model = {
      ...baseModel,
      serviceLines: [
        {
          ...requireServiceLine(baseModel),
          dayRate: "9".repeat(200),
        },
      ],
    } satisfies BillingDocumentModel;

    await expect(renderBillingPdf(model)).rejects.toThrow(
      /service-rate-0 text outside its layout box/u,
    );
  });

  it("embeds the supported font subsets as selectable text", async () => {
    const baseModel = createIssuedInvoiceDocumentModel(completeIssuedInvoice);
    const model = {
      ...baseModel,
      clientLegalName: "Latin Łódź Tiếng Việt Ελληνικά Українська עברית",
    } satisfies BillingDocumentModel;

    const result = await renderBillingPdf(model);
    const text = await readPdfText(result.bytes);
    const usedFontNames = [
      ...new Set(
        (await readUsedPdfTextFontNames(result.bytes)).map((fontName) =>
          fontName.replace(/^[A-Z]{6}\+/u, ""),
        ),
      ),
    ].sort();
    const compactText = text.replaceAll(/\s/gu, "");

    expect(compactText).toContain("LatinŁódź");
    expect(compactText).toContain("TiếngViệt");
    expect(compactText).toContain("Ελληνικά");
    expect(compactText).toContain("Українська");
    expect(compactText).toContain("עברית");
    expect(usedFontNames).toEqual(["Arimo-Bold", "Arimo-Italic", "Arimo-Regular"]);
  });

  it("preserves aggregate sterling totals on foreign-currency invoices and credits", async () => {
    const invoice = await renderBillingPdf(
      createIssuedInvoiceDocumentModel(completeForeignCurrencyVatIssuedInvoice),
    );
    const credit = await renderBillingPdf(
      createCreditNoteDocumentModel(completeForeignCurrencyVatCreditNote),
    );

    expect((await readPdfText(invoice.bytes)).replaceAll(/\s+/gu, " ")).toContain(
      "Sterling net GBP 2,320.00 Sterling VAT GBP 464.00 Sterling total GBP 2,784.00",
    );
    expect((await readPdfText(credit.bytes)).replaceAll(/\s+/gu, " ")).toContain(
      "Sterling net GBP -2,320.00 Sterling VAT GBP -464.00 Sterling total GBP -2,784.00",
    );
  });

  it("paginates a full credit note while retaining its identifiers and correction reason once", async () => {
    const baseModel = createCreditNoteDocumentModel(completeCreditNote);
    const model = {
      ...baseModel,
      serviceLines: Array.from({ length: 30 }, (_, index) => ({
        ...requireServiceLine(baseModel),
        renderKey: `credit-line-${index}`,
        serviceDescription: `Credited service ${index + 1}`,
      })),
    } satisfies BillingDocumentModel;

    const result = await renderBillingPdf(model);
    const text = await readPdfText(result.bytes);
    const pages = await readPdfPageEvidence(result.bytes);

    expect(result.pageCount).toBe(3);
    for (const [index, page] of pages.entries())
      expect(page.text).toContain(`Page ${index + 1} of 3`);
    expect(text.match(/Credited service/gu)).toHaveLength(30);
    expect(text.match(/CREDIT NOTE CN-GGIOHK-0043/gu)).toHaveLength(3);
    expect(text.match(/The billed service period was incorrect\./gu)).toHaveLength(1);
    expect(text.match(/TOTAL/gu)).toHaveLength(1);
    expect(
      pages.every(({ text: pageText }) => pageText.includes("CREDIT NOTE CN-GGIOHK-0043")),
    ).toBe(true);
  });

  it("allows ordinary notes to flow across pages without entering the footer", async () => {
    const baseModel = createIssuedInvoiceDocumentModel(completeIssuedInvoice);
    const model = {
      ...baseModel,
      notes: [Array.from({ length: 1_200 }, () => "flowing narrative").join(" ")],
    } satisfies BillingDocumentModel;

    const result = await renderBillingPdf(model);
    const text = await readPdfText(result.bytes);

    expect(result.pageCount).toBeGreaterThan(1);
    expect(text.match(/flowing/gu)).toHaveLength(1_200);
  });

  it("rejects unbroken issuer and correction text that exceeds its layout box", async () => {
    const invoiceModel = createIssuedInvoiceDocumentModel(completeIssuedInvoice);
    const issuerModel = {
      ...invoiceModel,
      issuer: persistedIssuerSettingsSchema.parse({
        ...invoiceModel.issuer,
        legalName: "W".repeat(200),
      }),
    } satisfies BillingDocumentModel;
    const creditModel = {
      ...createCreditNoteDocumentModel(completeCreditNote),
      reason: "W".repeat(300),
    } satisfies BillingDocumentModel;

    await expect(renderBillingPdf(issuerModel)).rejects.toThrow(/document-issuer text outside/u);
    await expect(renderBillingPdf(creditModel)).rejects.toThrow(
      /document-credit-reason text outside/u,
    );
  });

  it("rejects a total amount whose glyph advance exceeds its layout box", async () => {
    const baseModel = createIssuedInvoiceDocumentModel(completeIssuedInvoice);
    const model = {
      ...baseModel,
      gross: "9".repeat(200),
    } satisfies BillingDocumentModel;

    await expect(renderBillingPdf(model)).rejects.toThrow(/text outside its layout box/u);
  });

  it("rejects a domain-valid sterling rate bucket whose label and amount collide", async () => {
    const review = reviewInvoiceDraft({
      client: completeForeignCurrencyVatClient,
      draft: {
        ...completeForeignCurrencyVatInvoiceDraftInput,
        exchange: { ...completeForeignCurrencyVatInvoiceDraftInput.exchange, rate: "0.00000001" },
      },
      issuer: completeIssuer,
      today: parseBusinessDate("2026-09-06"),
    });
    expect(review.candidate).not.toBeNull();
    await expect(
      renderBillingPdf(createDraftInvoiceDocumentModel(completeIssuer, review)),
    ).rejects.toThrow(/text outside its layout box/u);
  });

  it("rejects domain-valid payment terms whose glyph advance exceeds the footer", async () => {
    const baseModel = createIssuedInvoiceDocumentModel(completeIssuedInvoice);
    const model = { ...baseModel, paymentTerms: "W".repeat(200) } satisfies BillingDocumentModel;

    await expect(renderBillingPdf(model)).rejects.toThrow(/document-footer text outside/u);
  });
});

function requireServiceLine(model: BillingDocumentModel) {
  const serviceLine = model.serviceLines[0];
  if (!serviceLine) throw new Error("Expected the billing PDF fixture to contain a service line");
  return serviceLine;
}

async function readPdfText(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: bytes.slice() });
  try {
    const document = await loadingTask.promise;
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = await page.getTextContent();
      pageTexts.push(text.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" "));
    }
    return pageTexts.join(" ");
  } finally {
    await loadingTask.destroy();
  }
}

async function readPdfPageEvidence(
  bytes: Uint8Array,
): Promise<readonly Readonly<{ hasImage: boolean; text: string; textLength: number }>[]> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: bytes.slice() });
  try {
    const document = await loadingTask.promise;
    const pages: Array<Readonly<{ hasImage: boolean; text: string; textLength: number }>> = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const [operators, text] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
      pages.push({
        hasImage: operators.fnArray.includes(OPS.paintImageXObject),
        text: text.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" "),
        textLength: text.items.reduce(
          (length, item) => length + ("str" in item ? item.str.length : 0),
          0,
        ),
      });
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}
