import { createHash } from "node:crypto";

import { BrowserWindow } from "electron";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";

import type {
  CreditNotePdf,
  InvoicePdf,
  PreparedDocumentPdf,
} from "../../application/workspace.js";
import invoiceDocumentCss from "../../documents/invoice-document.css?inline";
import { billingDocumentFontFaceCount } from "../../documents/billing-document-fonts.js";
import { BillingDocument } from "../../documents/invoice-document.js";
import {
  billingDocumentMeasurementsSchema,
  billingDocumentRenderProfile,
  collectBillingDocumentMeasurements,
  evaluateBillingDocumentFit,
} from "../../documents/document-fit.js";
import {
  createCandidateInvoiceDocumentModel,
  createCreditNoteDocumentModel,
  createIssuedInvoiceDocumentModel,
  type BillingDocumentModel,
} from "../../documents/invoice-document-model.js";
import { noFaultInjector, type FaultInjector } from "../testing/fault-injection.js";

type CreateDocumentPdfOptions = Readonly<{
  faultInjector?: FaultInjector;
}>;

const documentResourcesSchema = z.object({
  fonts: z.array(z.literal("loaded")).length(billingDocumentFontFaceCount),
  images: z
    .array(z.object({ complete: z.literal(true), height: z.literal(72), width: z.literal(334) }))
    .length(1),
});

export function createInvoicePdf({
  faultInjector = noFaultInjector,
}: CreateDocumentPdfOptions = {}): InvoicePdf {
  return {
    checkFit: (candidate) => checkDocumentFit(createCandidateInvoiceDocumentModel(candidate)),
    prepare: (snapshot) =>
      prepareDocument(createIssuedInvoiceDocumentModel(snapshot), snapshot.id, faultInjector),
  };
}

export function createCreditNotePdf({
  faultInjector = noFaultInjector,
}: CreateDocumentPdfOptions = {}): CreditNotePdf {
  return {
    checkFit: (candidate) => checkDocumentFit(createCreditNoteDocumentModel(candidate)),
    prepare: (snapshot) =>
      prepareDocument(createCreditNoteDocumentModel(snapshot), snapshot.id, faultInjector),
  };
}

async function checkDocumentFit(model: BillingDocumentModel): Promise<boolean> {
  const window = await loadDocumentWindow(model);
  try {
    const fit = await measureDocumentWindow(window);
    return fit.failures.length === 0;
  } finally {
    window.destroy();
  }
}

async function prepareDocument(
  model: BillingDocumentModel,
  documentId: string,
  faultInjector: FaultInjector,
): Promise<PreparedDocumentPdf> {
  const window = await loadDocumentWindow(model);
  try {
    const fit = await measureDocumentWindow(window);
    if (fit.failures.length > 0) {
      throw new Error(`The document does not fit on A4: ${fit.failures.join(", ")}`);
    }
    faultInjector.throwIfPlanned("pdf-generation");
    const bytes = await window.webContents.printToPDF({
      generateTaggedPDF: true,
      landscape: false,
      margins: { bottom: 0, left: 0, right: 0, top: 0 },
      pageSize: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      scale: 1,
    });
    faultInjector.throwIfPlanned("pdf-verification");
    verifyPdf(bytes);
    return {
      bytes,
      pdf: {
        filename: `${documentId}.pdf`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    };
  } finally {
    window.destroy();
  }
}

async function loadDocumentWindow(model: BillingDocumentModel): Promise<BrowserWindow> {
  const { pageHeightPixels, pageWidthPixels } = billingDocumentRenderProfile;
  const window = new BrowserWindow({
    backgroundColor: "#ffffff",
    height: pageHeightPixels,
    show: false,
    useContentSize: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    width: pageWidthPixels,
  });
  try {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    const markup = renderToStaticMarkup(<BillingDocument model={model} />);
    const html = `<!doctype html><html><head><meta charset="UTF-8"><style>${invoiceDocumentCss}</style></head><body>${markup}</body></html>`;
    await window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    window.webContents.setZoomFactor(1);
    const resourcesReady: unknown = await window.webContents.executeJavaScript(`Promise.all([
    ...Array.from(document.fonts).map((font) => font.load()),
    ...Array.from(document.images).map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", reject, { once: true });
        }))
  ]).then(() => ({
    fonts: Array.from(document.fonts)
      .filter((font) => font.family.replaceAll('"', '') === 'Arimo')
      .map((font) => font.status),
    images: Array.from(document.images).map((image) => ({
      complete: image.complete,
      height: image.naturalHeight,
      width: image.naturalWidth,
    })),
  }))`);
    documentResourcesSchema.parse(resourcesReady);
    return window;
  } catch (error) {
    window.destroy();
    throw error;
  }
}

async function measureDocumentWindow(window: BrowserWindow) {
  const rawMeasurements: unknown = await window.webContents.executeJavaScript(
    `(${collectBillingDocumentMeasurements.toString()})()`,
  );
  const measurements = billingDocumentMeasurementsSchema.parse(rawMeasurements);
  return evaluateBillingDocumentFit(measurements);
}

function verifyPdf(bytes: Uint8Array): void {
  const pdfText = Buffer.from(bytes).toString("latin1");
  const pageCount = pdfText.match(/\/Type\s*\/Page\b/gu)?.length ?? 0;
  const hasCompleteSinglePage = [
    pdfText.startsWith("%PDF-"),
    pdfText.trimEnd().endsWith("%%EOF"),
    pageCount === 1,
  ].every(Boolean);
  if (!hasCompleteSinglePage) {
    throw new Error("Electron did not create one complete PDF page");
  }
}
