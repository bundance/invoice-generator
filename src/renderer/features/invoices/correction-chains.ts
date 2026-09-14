import type { IssuedInvoice } from "../../../domain/invoices/issued-invoice.ts";

export function buildCorrectionChains(
  invoices: readonly IssuedInvoice[],
): readonly (readonly IssuedInvoice[])[] {
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const replacementIdByOriginalId = new Map<string, IssuedInvoice["id"]>();
  const replacementInvoiceIds = new Set<string>();
  for (const invoice of invoices) {
    if (!invoice.replacesInvoiceId) continue;
    replacementIdByOriginalId.set(invoice.replacesInvoiceId, invoice.id);
    replacementInvoiceIds.add(invoice.id);
  }
  const visitedInvoiceIds = new Set<string>();

  const buildChain = (firstInvoice: IssuedInvoice): readonly IssuedInvoice[] => {
    const chain: IssuedInvoice[] = [];
    let currentInvoice: IssuedInvoice | undefined = firstInvoice;
    while (currentInvoice && !visitedInvoiceIds.has(currentInvoice.id)) {
      chain.push(currentInvoice);
      visitedInvoiceIds.add(currentInvoice.id);
      const replacementInvoiceId = replacementIdByOriginalId.get(currentInvoice.id);
      currentInvoice = replacementInvoiceId ? invoiceById.get(replacementInvoiceId) : undefined;
    }
    return chain;
  };

  const chains: (readonly IssuedInvoice[])[] = [];
  for (const invoice of invoices) {
    if (!replacementInvoiceIds.has(invoice.id)) chains.push(buildChain(invoice));
  }
  for (const invoice of invoices) {
    if (!visitedInvoiceIds.has(invoice.id)) chains.push(buildChain(invoice));
  }
  return chains;
}
