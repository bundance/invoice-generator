import { z } from "zod";

const emptyListSchema = z.tuple([]).readonly();
const requiredTextSchema = z.string().min(1);
const sequenceSchema = z
  .strictObject({
    prefix: z.string().regex(/^[A-Z0-9]{2,12}$/u),
    nextNumber: z.string().regex(/^[1-9]\d*$/u),
  })
  .readonly();
const currencySchema = z
  .strictObject({
    code: z.string().regex(/^[A-Z]{3}$/u),
    minorUnit: z.number().int().min(0).max(4),
    name: requiredTextSchema,
  })
  .readonly();
const outsideScopeVatTreatmentSchema = z
  .strictObject({
    kind: z.literal("outside-scope"),
    evidenceReference: requiredTextSchema,
    reverseCharge: z.boolean(),
    wording: requiredTextSchema,
  })
  .readonly();
const ukTaxableVatTreatmentSchema = z
  .strictObject({
    kind: z.literal("uk-taxable"),
    rate: requiredTextSchema,
    taxPoint: z.iso.date(),
    wording: z.literal("UK VAT applies."),
  })
  .readonly();
const clientVatTreatmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("uk-taxable"),
    rate: requiredTextSchema,
    wording: z.literal("UK VAT applies."),
  }),
  outsideScopeVatTreatmentSchema,
]);
const issuerSchema = z
  .strictObject({
    legalName: requiredTextSchema,
    registeredAddress: requiredTextSchema,
    companyNumber: z.string().regex(/^[A-Z0-9]{1,8}$/u),
    vatRegistrationNumber: z.string().regex(/^\d{9}$/u),
    bankName: requiredTextSchema,
    sortCode: z.string().regex(/^\d{6}$/u),
    accountNumber: z.string().regex(/^\d{8}$/u),
    standardVatRate: z.string().regex(/^(?:0|[1-9]\d?)(?:\.\d+)?$|^100$/u),
    businessTimezone: requiredTextSchema,
    wordmark: z.literal("codernetic"),
  })
  .readonly();

const clientFields = {
  id: z.uuid(),
  legalName: requiredTextSchema,
  postalAddress: requiredTextSchema,
  currency: currencySchema,
  standardDayRate: requiredTextSchema,
  vatTreatment: clientVatTreatmentSchema,
  defaultServiceDescription: z.string(),
  paymentTerms: requiredTextSchema,
  invoiceSequence: sequenceSchema,
} as const;
const clientV1ToV4Schema = z
  .strictObject({ ...clientFields, creditNoteSequence: sequenceSchema })
  .superRefine((client, context) => {
    if (client.invoiceSequence.prefix === client.creditNoteSequence.prefix) {
      context.addIssue({
        code: "custom",
        message: "Invoice and credit-note prefixes must differ.",
        path: ["creditNoteSequence", "prefix"],
      });
    }
  })
  .readonly();
const clientV5Schema = z.strictObject(clientFields).readonly();
const clientsV1ToV4Schema = z
  .array(clientV1ToV4Schema)
  .superRefine(checkReleasedClientCollection)
  .readonly();
const clientsV5Schema = z.array(clientV5Schema).superRefine(checkReleasedV5Clients).readonly();

const invoiceDraftCommonFields = {
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
} as const;
const preVatOutsideScopeDraftV1Schema = z.strictObject({
  ...invoiceDraftCommonFields,
  outsideScopeEvidenceReference: z.string(),
  reverseCharge: z.boolean(),
});
const flatDraftV1Schema = z.strictObject({
  ...invoiceDraftCommonFields,
  vatTreatment: z.enum(["uk-taxable", "outside-scope"]),
  vatRate: z.string(),
  taxPoint: z.string(),
  outsideScopeEvidenceReference: z.string(),
  reverseCharge: z.boolean(),
});
const outsideScopeDraftV2Schema = z.strictObject({
  ...invoiceDraftCommonFields,
  vatTreatment: z.literal("outside-scope"),
  outsideScopeEvidenceReference: z.string(),
  reverseCharge: z.boolean(),
});
const ukTaxableDraftV2Schema = z.strictObject({
  ...invoiceDraftCommonFields,
  vatTreatment: z.literal("uk-taxable"),
  vatRate: z.string(),
  taxPoint: z.string(),
});
const exchangeDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("not-required") }),
  z.strictObject({
    effectiveDate: z.string(),
    evidenceReference: z.string(),
    kind: z.literal("required"),
    method: z.string(),
    rate: z.string(),
  }),
]);
const draftV3ToV5Schema = z
  .discriminatedUnion("vatTreatment", [
    ukTaxableDraftV2Schema.extend({ exchange: exchangeDraftSchema }),
    outsideScopeDraftV2Schema,
  ])
  .superRefine((draft, context) => {
    if (
      draft.vatTreatment === "uk-taxable" &&
      (draft.currencyCode === "GBP") !== (draft.exchange.kind === "not-required")
    ) {
      context.addIssue({
        code: "custom",
        message: "The exchange draft must match the invoice currency.",
        path: ["exchange"],
      });
    }
  });

const invoiceTaxFactsSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("outside-scope"),
    vatTreatment: outsideScopeVatTreatmentSchema,
  }),
  z.strictObject({ kind: z.literal("gbp-uk-vat"), vatTreatment: ukTaxableVatTreatmentSchema }),
  z.strictObject({
    kind: z.literal("foreign-currency-uk-vat"),
    vatTreatment: ukTaxableVatTreatmentSchema,
    sterlingVatSummary: z.strictObject({
      exchangeRecord: z.strictObject({
        effectiveDate: z.iso.date(),
        evidenceReference: requiredTextSchema,
        method: requiredTextSchema,
        rate: requiredTextSchema,
      }),
      totals: z.strictObject({
        net: requiredTextSchema,
        vat: requiredTextSchema,
        gross: requiredTextSchema,
      }),
    }),
  }),
]);
const issuedInvoiceCommonFields = {
  id: z.string().regex(/^[A-Z0-9]{2,12}-\d{4,}$/u),
  invoiceNumber: z.string().regex(/^[1-9]\d*$/u),
  client: z.strictObject({
    id: z.uuid(),
    legalName: requiredTextSchema,
    postalAddress: requiredTextSchema,
  }),
  currency: currencySchema,
  serviceDescription: requiredTextSchema,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  billableDays: requiredTextSchema,
  dayRate: requiredTextSchema,
  paymentTerms: requiredTextSchema,
  notes: z.string(),
  purchaseOrder: z.string(),
  issuer: issuerSchema,
  totals: z.strictObject({
    net: requiredTextSchema,
    vat: requiredTextSchema,
    gross: requiredTextSchema,
  }),
  issue: z.strictObject({
    date: z.iso.date(),
    timestamp: z.iso.datetime(),
    businessTimezone: requiredTextSchema,
    lateIssueDateAcknowledged: z.boolean(),
  }),
  retainedPdf: z.strictObject({
    filename: z.string().regex(/\.pdf$/u),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
} as const;
const issuedInvoiceV1ToV2Schema = z.strictObject({
  ...issuedInvoiceCommonFields,
  vatTreatment: z.discriminatedUnion("kind", [
    ukTaxableVatTreatmentSchema,
    outsideScopeVatTreatmentSchema,
  ]),
});
const issuedInvoiceV3ToV5Schema = z.strictObject({
  ...issuedInvoiceCommonFields,
  taxFacts: invoiceTaxFactsSchema,
});
const issuedInvoicesV1ToV2Schema = z
  .array(issuedInvoiceV1ToV2Schema)
  .superRefine(checkUniqueInvoiceIds)
  .readonly();
const issuedInvoicesV3ToV5Schema = z
  .array(issuedInvoiceV3ToV5Schema)
  .superRefine(checkUniqueInvoiceIds)
  .readonly();
const issuedInvoiceV6Schema = issuedInvoiceV3ToV5Schema.extend({
  replacesInvoiceId: issuedInvoiceCommonFields.id.nullable().default(null),
});
const issuedInvoicesV6Schema = z
  .array(issuedInvoiceV6Schema)
  .superRefine(checkUniqueInvoiceIds)
  .readonly();

const creditNoteSchema = z.strictObject({
  id: z.string().regex(/^CN-[A-Z0-9]{2,12}-\d{4,}$/u),
  originalInvoiceId: issuedInvoiceCommonFields.id,
  originalIssueDate: z.iso.date(),
  reason: requiredTextSchema,
  client: issuedInvoiceCommonFields.client,
  currency: issuedInvoiceCommonFields.currency,
  serviceDescription: issuedInvoiceCommonFields.serviceDescription,
  periodStart: issuedInvoiceCommonFields.periodStart,
  periodEnd: issuedInvoiceCommonFields.periodEnd,
  billableDays: issuedInvoiceCommonFields.billableDays,
  dayRate: issuedInvoiceCommonFields.dayRate,
  paymentTerms: issuedInvoiceCommonFields.paymentTerms,
  notes: issuedInvoiceCommonFields.notes,
  purchaseOrder: issuedInvoiceCommonFields.purchaseOrder,
  issuer: issuedInvoiceCommonFields.issuer,
  totals: issuedInvoiceCommonFields.totals,
  taxFacts: invoiceTaxFactsSchema,
  issue: z.strictObject({
    date: z.iso.date(),
    timestamp: z.iso.datetime(),
    businessTimezone: requiredTextSchema,
  }),
  retainedPdf: issuedInvoiceCommonFields.retainedPdf,
});
const creditNotesV4ToV5Schema = z
  .array(creditNoteSchema)
  .superRefine(checkUniqueOriginalInvoiceIds)
  .readonly();
const creditNoteV6Schema = creditNoteSchema.extend({
  replacesInvoiceId: issuedInvoiceCommonFields.id.nullable().default(null),
});
const creditNotesV6Schema = z
  .array(creditNoteV6Schema)
  .superRefine(checkUniqueOriginalInvoiceIds)
  .readonly();

const replacementDraftSourceSchema = issuedInvoiceCommonFields.id;
const workspaceDraftV6Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ordinary"), draft: draftV3ToV5Schema }),
  z.strictObject({
    kind: z.literal("replacement"),
    draft: draftV3ToV5Schema,
    source: replacementDraftSourceSchema,
  }),
]);

const workspaceFields = {
  issuer: issuerSchema.nullable(),
  voidedInvoiceNumbers: emptyListSchema,
  replacementLinks: emptyListSchema,
} as const;

export const releasedWorkspaceStateV1Schema = z.strictObject({
  ...workspaceFields,
  schemaVersion: z.literal(1),
  clients: clientsV1ToV4Schema,
  invoiceDraft: z.union([flatDraftV1Schema, preVatOutsideScopeDraftV1Schema]).nullable(),
  issuedInvoices: issuedInvoicesV1ToV2Schema,
  creditNotes: emptyListSchema,
});
export const releasedWorkspaceStateV2Schema = z.strictObject({
  ...workspaceFields,
  schemaVersion: z.literal(2),
  clients: clientsV1ToV4Schema,
  invoiceDraft: z
    .discriminatedUnion("vatTreatment", [ukTaxableDraftV2Schema, outsideScopeDraftV2Schema])
    .nullable(),
  issuedInvoices: issuedInvoicesV1ToV2Schema,
  creditNotes: emptyListSchema,
});
export const releasedWorkspaceStateV3Schema = z.strictObject({
  ...workspaceFields,
  schemaVersion: z.literal(3),
  clients: clientsV1ToV4Schema,
  invoiceDraft: draftV3ToV5Schema.nullable(),
  issuedInvoices: issuedInvoicesV3ToV5Schema,
  creditNotes: emptyListSchema,
});
export const releasedWorkspaceStateV4Schema = z.strictObject({
  ...workspaceFields,
  schemaVersion: z.literal(4),
  clients: clientsV1ToV4Schema,
  invoiceDraft: draftV3ToV5Schema.nullable(),
  issuedInvoices: issuedInvoicesV3ToV5Schema,
  creditNotes: creditNotesV4ToV5Schema,
});
export const releasedWorkspaceStateV5Schema = z.strictObject({
  ...workspaceFields,
  schemaVersion: z.literal(5),
  clients: clientsV5Schema,
  invoiceDraft: draftV3ToV5Schema.nullable(),
  issuedInvoices: issuedInvoicesV3ToV5Schema,
  creditNotes: creditNotesV4ToV5Schema,
});
export const releasedWorkspaceStateV6Schema = z.strictObject({
  schemaVersion: z.literal(6),
  issuer: issuerSchema.nullable(),
  clients: clientsV5Schema,
  draft: workspaceDraftV6Schema.nullable(),
  issuedInvoices: issuedInvoicesV6Schema,
  creditNotes: creditNotesV6Schema,
  voidedInvoiceNumbers: emptyListSchema,
});

function checkReleasedClientCollection(
  clients: readonly z.output<typeof clientV1ToV4Schema>[],
  context: z.core.$RefinementCtx,
): void {
  const clientIds = new Set<string>();
  const prefixes = new Set<string>();
  const identifiers = new Set<string>();
  for (const [index, client] of clients.entries()) {
    addDuplicateIssue(clientIds, client.id, context, [index, "id"]);
    for (const [name, sequence] of [
      ["invoiceSequence", client.invoiceSequence],
      ["creditNoteSequence", client.creditNoteSequence],
    ] as const) {
      addDuplicateIssue(prefixes, sequence.prefix.toUpperCase(), context, [index, name, "prefix"]);
      addDuplicateIssue(
        identifiers,
        `${sequence.prefix}-${sequence.nextNumber.padStart(4, "0")}`.toUpperCase(),
        context,
        [index, name, "nextNumber"],
      );
    }
  }
}

function checkReleasedV5Clients(
  clients: readonly z.output<typeof clientV5Schema>[],
  context: z.core.$RefinementCtx,
): void {
  const clientIds = new Set<string>();
  const prefixes = new Set<string>();
  for (const [index, client] of clients.entries()) {
    addDuplicateIssue(clientIds, client.id, context, [index, "id"]);
    addDuplicateIssue(prefixes, client.invoiceSequence.prefix.toUpperCase(), context, [
      index,
      "invoiceSequence",
      "prefix",
    ]);
  }
}

function checkUniqueInvoiceIds(
  invoices: readonly Readonly<{ id: string }>[],
  context: z.core.$RefinementCtx,
): void {
  const ids = new Set<string>();
  for (const [index, invoice] of invoices.entries()) {
    addDuplicateIssue(ids, invoice.id, context, [index, "id"]);
  }
}

function checkUniqueOriginalInvoiceIds(
  creditNotes: readonly Readonly<{ originalInvoiceId: string }>[],
  context: z.core.$RefinementCtx,
): void {
  const invoiceIds = new Set<string>();
  for (const [index, creditNote] of creditNotes.entries()) {
    if (invoiceIds.has(creditNote.originalInvoiceId)) {
      context.addIssue({
        code: "custom",
        message: "An invoice can have only one full credit note.",
        path: [index, "originalInvoiceId"],
      });
    }
    invoiceIds.add(creditNote.originalInvoiceId);
  }
}

function addDuplicateIssue(
  values: Set<string>,
  value: string,
  context: z.core.$RefinementCtx,
  path: PropertyKey[],
): void {
  if (values.has(value)) {
    context.addIssue({ code: "custom", message: "Persisted values must be unique.", path });
  }
  values.add(value);
}
