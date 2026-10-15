import { render } from "@testing-library/react";
import { createElement, useEffect, type ReactElement } from "react";

import type {
  InvoiceAppBridge,
  IssuerSettingsSaveResult,
} from "../../application/invoice-application-contract.ts";
import { type Client, persistedClientSchema } from "../../domain/clients/client.ts";
import {
  type IssuerSettingsInput,
  parseIssuerSettingsInput,
} from "../../domain/issuer/issuer-settings.ts";
import { parseBusinessDate } from "../../domain/time/business-date.ts";
import {
  BillingPdfViewerProvider,
  type BillingPdfViewerProps,
} from "../ui/billing-pdf-preview.tsx";
import { completeClient } from "../../../tests/fixtures/client.ts";

export const businessDate = parseBusinessDate("2026-09-04");

export const emptyWorkspace = {
  kind: "ready",
  workspace: {
    appVersion: "0.1.0",
    clients: [],
    currentBusinessDate: businessDate,
    draft: null,
    creditNotes: [],
    issuedInvoices: [],
    issuer: null,
  },
} as const;

export const unusedInvoiceAppCommands = {
  cancelRestoreBackup: () => Promise.reject(new Error("Restore is not used in this test")),
  createBackup: () => Promise.reject(new Error("Backup creation is not used in this test")),
  createClient: () => Promise.reject(new Error("Client creation is not used in this test")),
  createReplacementDraft: () =>
    Promise.reject(new Error("Replacement creation is not used in this test")),
  replaceDraftWithReplacement: () =>
    Promise.reject(new Error("Draft replacement is not used in this test")),
  discardInvoiceDraft: () => Promise.reject(new Error("Draft discard is not used in this test")),
  exportRetainedDocument: () => Promise.reject(new Error("PDF export is not used in this test")),
  issueFullCreditNote: () =>
    Promise.reject(new Error("Credit-note issue is not used in this test")),
  issueInvoice: () => Promise.reject(new Error("Invoice issue is not used in this test")),
  inspectRestoreBackup: () => Promise.reject(new Error("Restore is not used in this test")),
  loadWorkspace: () => Promise.reject(new Error("Workspace loading is not used in this test")),
  openRetainedDocument: () => Promise.reject(new Error("PDF opening is not used in this test")),
  previewFullCreditNote: () =>
    Promise.reject(new Error("Credit-note preview is not used in this test")),
  previewInvoiceDraft: () => Promise.reject(new Error("Invoice preview is not used in this test")),
  printRetainedDocument: () => Promise.reject(new Error("PDF printing is not used in this test")),
  quitApplication: () => Promise.reject(new Error("Quit is not used in this test")),
  reviewInvoiceIssue: () => Promise.reject(new Error("Invoice review is not used in this test")),
  reviewFullCreditNote: () =>
    Promise.reject(new Error("Credit-note review is not used in this test")),
  restoreBackup: () => Promise.reject(new Error("Restore is not used in this test")),
  saveInvoiceDraft: () => Promise.reject(new Error("Draft save is not used in this test")),
  saveIssuerSettings: () => Promise.reject(new Error("Issuer settings are not used in this test")),
  updateClient: () => Promise.reject(new Error("Client editing is not used in this test")),
} satisfies Pick<
  InvoiceAppBridge,
  | "cancelRestoreBackup"
  | "createClient"
  | "createBackup"
  | "createReplacementDraft"
  | "discardInvoiceDraft"
  | "exportRetainedDocument"
  | "issueFullCreditNote"
  | "issueInvoice"
  | "inspectRestoreBackup"
  | "loadWorkspace"
  | "openRetainedDocument"
  | "previewFullCreditNote"
  | "previewInvoiceDraft"
  | "printRetainedDocument"
  | "quitApplication"
  | "reviewInvoiceIssue"
  | "reviewFullCreditNote"
  | "replaceDraftWithReplacement"
  | "restoreBackup"
  | "saveInvoiceDraft"
  | "saveIssuerSettings"
  | "updateClient"
>;

export const testInvoiceAppCommands = {
  ...unusedInvoiceAppCommands,
  previewFullCreditNote: () =>
    Promise.resolve({
      kind: "ready",
      preview: { bytes: new Uint8Array([37, 80, 68, 70]), documentId: "Credit note", pageCount: 1 },
    }),
  previewInvoiceDraft: () =>
    Promise.resolve({
      kind: "ready",
      preview: { bytes: new Uint8Array([37, 80, 68, 70]), documentId: "Draft", pageCount: 1 },
    }),
} satisfies Pick<InvoiceAppBridge, "previewFullCreditNote" | "previewInvoiceDraft">;

export function renderAppForTest(element: ReactElement) {
  return render(
    createElement(BillingPdfViewerProvider, { viewer: TestBillingPdfViewerContent }, element),
  );
}

function TestBillingPdfViewerContent({ onReady }: BillingPdfViewerProps) {
  useEffect(() => {
    const readyTimer = window.setTimeout(onReady, 0);
    return () => window.clearTimeout(readyTimer);
  }, [onReady]);
  return createElement("div", { "aria-label": "Rendered PDF pages" }, "1 PDF page");
}

export function savedIssuerSettings(input: IssuerSettingsInput): IssuerSettingsSaveResult {
  return { kind: "saved", issuer: parseIssuerSettingsInput(input) };
}

export type Deferred<Result> = Readonly<{
  promise: Promise<Result>;
  resolve: (result: Result) => void;
}>;

export function deferred<Result>(): Deferred<Result> {
  let resolvePromise: ((result: Result) => void) | undefined;
  const promise = new Promise<Result>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (result) => {
      if (!resolvePromise) throw new Error("Deferred promise is not ready");
      resolvePromise(result);
    },
  };
}

export function makeOtherClient(): Client {
  return persistedClientSchema.parse({
    ...completeClient,
    id: "647253f4-113c-4d84-8381-c219776b7469",
    legalName: "Acme Research Ltd",
    currency: { code: "GBP", minorUnit: 2, name: "Pound Sterling" },
    vatTreatment: { kind: "uk-taxable", rate: "20", wording: "UK VAT applies." },
    invoiceSequence: { prefix: "ACME", nextNumber: "9007199254740993" },
  });
}

export async function replaceField(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
): Promise<void> {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
}
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
