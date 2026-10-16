import { createHash } from "node:crypto";

import type {
  CreditNotePdf,
  InvoicePdf,
  PdfPreview,
  PreparedDocumentPdf,
} from "../../application/workspace.js";
import {
  createCandidateInvoiceDocumentModel,
  createCreditNoteDocumentModel,
  createDraftInvoiceDocumentModel,
  createIssuedInvoiceDocumentModel,
  type BillingDocumentModel,
} from "../../documents/invoice-document-model.js";
import { noFaultInjector, type FaultInjector } from "../testing/fault-injection.js";
import { BillingPdfLayoutViolation } from "../../documents/billing-pdf-layout.ts";
import { renderBillingPdf } from "./billing-pdf-engine.js";

type CreateDocumentPdfOptions = Readonly<{
  faultInjector?: FaultInjector;
}>;

export function createInvoicePdf({
  faultInjector = noFaultInjector,
}: CreateDocumentPdfOptions = {}): InvoicePdf {
  return {
    checkLayout: (candidate) => checkLayout(createCandidateInvoiceDocumentModel(candidate)),
    prepare: (snapshot) =>
      prepareDocument(createIssuedInvoiceDocumentModel(snapshot), snapshot.id, faultInjector),
    preview: (issuer, review) => createPreview(createDraftInvoiceDocumentModel(issuer, review)),
  };
}

export function createCreditNotePdf({
  faultInjector = noFaultInjector,
}: CreateDocumentPdfOptions = {}): CreditNotePdf {
  return {
    checkLayout: (candidate) => checkLayout(createCreditNoteDocumentModel(candidate)),
    prepare: (snapshot) =>
      prepareDocument(createCreditNoteDocumentModel(snapshot), snapshot.id, faultInjector),
    preview: (candidate) => createPreview(createCreditNoteDocumentModel(candidate)),
  };
}

async function checkLayout(model: BillingDocumentModel): Promise<boolean> {
  try {
    await renderBillingPdf(model);
    return true;
  } catch (error) {
    if (error instanceof BillingPdfLayoutViolation) return false;
    throw error;
  }
}

async function createPreview(model: BillingDocumentModel): Promise<PdfPreview> {
  const rendered = await renderBillingPdf(model);
  return {
    bytes: rendered.bytes,
    documentId: model.id,
  };
}

async function prepareDocument(
  model: BillingDocumentModel,
  documentId: string,
  faultInjector: FaultInjector,
): Promise<PreparedDocumentPdf> {
  faultInjector.throwIfPlanned("pdf-generation");
  const rendered = await renderBillingPdf(model);
  faultInjector.throwIfPlanned("pdf-verification");
  return {
    bytes: rendered.bytes,
    pdf: {
      filename: `${documentId}.pdf`,
      sha256: createHash("sha256").update(rendered.bytes).digest("hex"),
    },
  };
}
