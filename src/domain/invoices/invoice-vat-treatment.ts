import { z } from "zod";

import {
  outsideScopeVatWording,
  outsideScopeWording,
  reverseChargeWording,
  ukTaxableWording,
} from "../tax/vat-wording.ts";
import { createFieldSchemas, normalizeRequiredMultiline } from "../validation/text-field.ts";

const calendarDateSchema = z.iso.date();
const requiredEvidenceSchema = createFieldSchemas<"InvoiceOutsideScopeEvidence">((value) =>
  normalizeRequiredMultiline(value, "Enter an outside-scope evidence reference."),
).persisted;

export const persistedUkTaxableVatTreatmentSchema = z
  .strictObject({
    kind: z.literal("uk-taxable"),
    taxPoint: calendarDateSchema,
    wording: z.literal(ukTaxableWording),
  })
  .readonly();

export const persistedOutsideScopeVatTreatmentSchema = z
  .strictObject({
    evidenceReference: requiredEvidenceSchema,
    kind: z.literal("outside-scope"),
    reverseCharge: z.boolean(),
    wording: z.union([z.literal(outsideScopeWording), z.literal(reverseChargeWording)]),
  })
  .superRefine((treatment, context) => {
    if (treatment.wording !== outsideScopeVatWording(treatment.reverseCharge)) {
      context.addIssue({ code: "custom", message: "Use the matching VAT wording." });
    }
  })
  .readonly();

export const persistedInvoiceVatTreatmentSchema = z.discriminatedUnion("kind", [
  persistedUkTaxableVatTreatmentSchema,
  persistedOutsideScopeVatTreatmentSchema,
]);

export type InvoiceVatTreatment = Readonly<z.output<typeof persistedInvoiceVatTreatmentSchema>>;
