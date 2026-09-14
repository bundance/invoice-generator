import { z } from "zod";

import { persistedSterlingVatSummarySchema } from "./exchange-record.ts";
import {
  persistedOutsideScopeVatTreatmentSchema,
  persistedUkTaxableVatTreatmentSchema,
} from "./invoice-vat-treatment.ts";

export function createInvoiceTaxFactsSchema<SterlingVatSummarySchema extends z.ZodType>(
  sterlingVatSummarySchema: SterlingVatSummarySchema,
) {
  return z.discriminatedUnion("kind", [
    z
      .strictObject({
        kind: z.literal("outside-scope"),
        vatTreatment: persistedOutsideScopeVatTreatmentSchema,
      })
      .readonly(),
    z
      .strictObject({
        kind: z.literal("gbp-uk-vat"),
        vatTreatment: persistedUkTaxableVatTreatmentSchema,
      })
      .readonly(),
    z
      .strictObject({
        kind: z.literal("foreign-currency-uk-vat"),
        sterlingVatSummary: sterlingVatSummarySchema,
        vatTreatment: persistedUkTaxableVatTreatmentSchema,
      })
      .readonly(),
  ]);
}

export const persistedInvoiceTaxFactsSchema = createInvoiceTaxFactsSchema(
  persistedSterlingVatSummarySchema,
);

export type InvoiceTaxFacts = Readonly<z.output<typeof persistedInvoiceTaxFactsSchema>>;
