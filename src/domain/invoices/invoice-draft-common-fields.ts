import { z } from "zod";

export const invoiceDraftCommonFieldsSchema = z.strictObject({
  clientId: z.uuid(),
  clientLegalName: z.string(),
  clientPostalAddress: z.string(),
  currencyCode: z.string(),
  serviceDescription: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  issueDate: z.string(),
  billableDays: z.string(),
  dayRate: z.string(),
  paymentTerms: z.string(),
  notes: z.string(),
  purchaseOrder: z.string(),
});
