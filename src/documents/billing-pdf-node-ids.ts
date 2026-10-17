const serviceRowPrefix = "service-row-";

export const billingPdfNodeIds = {
  continuation: "document-continuation",
  footer: "document-footer",
  pageNumber: "document-page-number",
  totals: "document-totals",
  serviceRow: (index: number) => `${serviceRowPrefix}${index}`,
  isServiceRow: (id: string) => id.startsWith(serviceRowPrefix),
} as const;
