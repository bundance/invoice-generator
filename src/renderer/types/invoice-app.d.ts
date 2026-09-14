import type { InvoiceAppBridge } from "../../application/invoice-application-contract.ts";

declare global {
  interface Window {
    invoiceApp: InvoiceAppBridge;
  }
}

export {};
