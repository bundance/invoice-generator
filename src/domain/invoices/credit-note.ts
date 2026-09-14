import { z } from "zod";

import {
  createFieldSchemas,
  normalizeRequiredMultiline,
  type NormalizedField,
} from "../validation/text-field.ts";
import { persistedExchangeRecordSchema } from "./exchange-record.ts";
import { type IssuedInvoice, unrefinedIssuedInvoiceSnapshotSchema } from "./issued-invoice.ts";
import { createInvoiceTaxFactsSchema } from "./invoice-tax-facts.ts";
import type { BusinessDate } from "../time/business-date.ts";

const creditNoteIdSchema = z
  .string()
  .max(216)
  .regex(/^CN-[A-Z0-9]{2,12}-\d{4,}$/u)
  .brand<"CreditNoteId">();
const signedDecimalSchema = z
  .string()
  .max(201)
  .regex(/^(?:0(?:\.0+)?|-(?:0\.\d*[1-9]\d*|[1-9]\d*(?:\.\d+)?))$/u);
const sterlingCreditAmountSchema = z
  .string()
  .max(204)
  .regex(/^(?:0\.00|-(?:0\.(?:0[1-9]|[1-9]\d)|[1-9]\d*\.\d{2}))$/u);
const correctionReasonSchemas = createFieldSchemas<"CorrectionReason">(normalizeCorrectionReason);
const retainedCreditNotePdfSchema = z
  .strictObject({
    filename: z.string().max(220),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .readonly();
const creditNoteTaxFactsSchema = createInvoiceTaxFactsSchema(
  z
    .strictObject({
      exchangeRecord: persistedExchangeRecordSchema,
      totals: z
        .strictObject({
          gross: sterlingCreditAmountSchema,
          net: sterlingCreditAmountSchema,
          vat: sterlingCreditAmountSchema,
        })
        .readonly(),
    })
    .readonly(),
);

const originalInvoiceFields = unrefinedIssuedInvoiceSnapshotSchema.omit({
  billableDays: true,
  id: true,
  invoiceNumber: true,
  issue: true,
  taxFacts: true,
  totals: true,
});

const creditNoteSnapshotSchema = originalInvoiceFields
  .extend({
    billableDays: signedDecimalSchema,
    id: creditNoteIdSchema,
    originalInvoiceId: unrefinedIssuedInvoiceSnapshotSchema.shape.id,
    originalIssueDate: z.iso.date(),
    reason: correctionReasonSchemas.persisted,
    taxFacts: creditNoteTaxFactsSchema,
    totals: z
      .strictObject({
        gross: signedDecimalSchema,
        net: signedDecimalSchema,
        vat: signedDecimalSchema,
      })
      .readonly(),
    issue: z
      .strictObject({
        businessTimezone: z.string().min(1),
        date: z.iso.date(),
        timestamp: z.iso.datetime(),
      })
      .readonly(),
  })
  .readonly()
  .brand<"CreditNoteSnapshot">();

export const persistedCreditNoteSchema = creditNoteSnapshotSchema
  .unwrap()
  .extend({ retainedPdf: retainedCreditNotePdfSchema })
  .superRefine((creditNote, context) => {
    if (creditNote.id !== `CN-${creditNote.originalInvoiceId}`) {
      context.addIssue({
        code: "custom",
        message: "The credit-note ID must identify its original invoice.",
        path: ["id"],
      });
    }
    if (creditNote.retainedPdf.filename !== `${creditNote.id}.pdf`) {
      context.addIssue({
        code: "custom",
        message: "The retained PDF filename must match the credit-note ID.",
        path: ["retainedPdf", "filename"],
      });
    }
  })
  .readonly()
  .brand<"CreditNote">();

export const persistedCreditNotesSchema = z
  .array(persistedCreditNoteSchema)
  .superRefine((creditNotes, context) => {
    const originalInvoiceIds = new Set<string>();
    for (const [index, creditNote] of creditNotes.entries()) {
      if (originalInvoiceIds.has(creditNote.originalInvoiceId)) {
        context.addIssue({
          code: "custom",
          message: "An invoice can have only one full credit note.",
          path: [index, "originalInvoiceId"],
        });
      }
      originalInvoiceIds.add(creditNote.originalInvoiceId);
    }
  })
  .readonly();

const fullCreditNoteInputSchema = z.strictObject({
  issueDate: z.string(),
  originalInvoiceId: z.string(),
  reason: z.string(),
});
const fullCreditNoteCandidateSchema = creditNoteSnapshotSchema
  .unwrap()
  .omit({ issue: true })
  .extend({ issueDate: z.iso.date() })
  .readonly()
  .brand<"FullCreditNoteCandidate">();
const fullCreditNoteIssueInputSchema = z.strictObject({
  candidate: fullCreditNoteCandidateSchema,
});

export type CreditNoteSnapshot = Readonly<z.output<typeof creditNoteSnapshotSchema>>;
export type CreditNote = Readonly<z.output<typeof persistedCreditNoteSchema>>;
export type CreditNoteId = z.output<typeof creditNoteIdSchema>;
export type CreditNoteTaxFacts = Readonly<z.output<typeof creditNoteTaxFactsSchema>>;
export type RetainedCreditNotePdf = CreditNote["retainedPdf"];
export type FullCreditNoteInput = Readonly<z.output<typeof fullCreditNoteInputSchema>>;
export type FullCreditNoteIssueInput = Readonly<z.output<typeof fullCreditNoteIssueInputSchema>>;
export type FullCreditNoteCandidate = Readonly<z.output<typeof fullCreditNoteCandidateSchema>>;
export type FullCreditNoteReview =
  | Readonly<{ kind: "ready"; candidate: FullCreditNoteCandidate }>
  | Readonly<{ kind: "invalid"; message: string }>;

type ReviewFullCreditNoteOptions = Readonly<{
  input: FullCreditNoteInput;
  invoice: IssuedInvoice;
  today: BusinessDate;
}>;

export function reviewFullCreditNote({
  input,
  invoice,
  today,
}: ReviewFullCreditNoteOptions): FullCreditNoteReview {
  const reasonResult = correctionReasonSchemas.input.safeParse(input.reason);
  const issueDateResult = z.iso.date().safeParse(input.issueDate);
  if (!reasonResult.success) {
    return {
      kind: "invalid",
      message: reasonResult.error.issues[0]?.message ?? "Enter a genuine correction reason.",
    };
  }
  if (!issueDateResult.success) return { kind: "invalid", message: "Enter a valid issue date." };
  if (input.originalInvoiceId !== invoice.id) {
    return { kind: "invalid", message: "The original invoice changed. Start again." };
  }
  if (issueDateResult.data < invoice.issue.date || issueDateResult.data > today) {
    return {
      kind: "invalid",
      message: "Choose a credit-note date from the invoice issue date through today.",
    };
  }

  return {
    kind: "ready",
    candidate: createCandidate(invoice, issueDateResult.data, reasonResult.data),
  };
}

type CreateFullCreditNoteSnapshotOptions = Readonly<{
  candidate: FullCreditNoteCandidate;
  issuedAt: string;
}>;

export function createFullCreditNoteSnapshot({
  candidate,
  issuedAt,
}: CreateFullCreditNoteSnapshotOptions): CreditNoteSnapshot {
  const { issueDate, ...candidateFields } = candidate;
  return creditNoteSnapshotSchema.parse({
    ...candidateFields,
    issue: {
      businessTimezone: candidate.issuer.businessTimezone,
      date: issueDate,
      timestamp: issuedAt,
    },
  });
}

type UntrustedFullCreditNoteInput = Parameters<typeof fullCreditNoteInputSchema.parse>[0];

export function parseFullCreditNoteInput(value: UntrustedFullCreditNoteInput): FullCreditNoteInput {
  return fullCreditNoteInputSchema.parse(value);
}

type UntrustedFullCreditNoteIssueInput = Parameters<typeof fullCreditNoteIssueInputSchema.parse>[0];

export function parseFullCreditNoteIssueInput(
  value: UntrustedFullCreditNoteIssueInput,
): FullCreditNoteIssueInput {
  return fullCreditNoteIssueInputSchema.parse(value);
}

type UntrustedCreditNoteId = Parameters<typeof creditNoteIdSchema.parse>[0];

export function parseCreditNoteId(value: UntrustedCreditNoteId): CreditNoteId {
  return creditNoteIdSchema.parse(value);
}

export function creditNoteMatchesInvoice(creditNote: CreditNote, invoice: IssuedInvoice): boolean {
  const { issue, retainedPdf: _retainedPdf, ...creditNoteFields } = creditNote;
  const actualCandidate = { ...creditNoteFields, issueDate: issue.date };
  const expectedCandidate = createCandidate(invoice, issue.date, creditNote.reason);
  return (
    issue.businessTimezone === invoice.issuer.businessTimezone &&
    issue.date >= invoice.issue.date &&
    JSON.stringify(actualCandidate) === JSON.stringify(expectedCandidate)
  );
}

function createCandidate(
  invoice: IssuedInvoice,
  issueDate: string,
  reason: string,
): FullCreditNoteCandidate {
  return fullCreditNoteCandidateSchema.parse({
    billableDays: negateDecimal(invoice.billableDays),
    client: invoice.client,
    currency: invoice.currency,
    dayRate: invoice.dayRate,
    id: `CN-${invoice.id}`,
    issuer: invoice.issuer,
    issueDate,
    notes: invoice.notes,
    originalInvoiceId: invoice.id,
    originalIssueDate: invoice.issue.date,
    paymentTerms: invoice.paymentTerms,
    periodEnd: invoice.periodEnd,
    periodStart: invoice.periodStart,
    purchaseOrder: invoice.purchaseOrder,
    reason,
    serviceDescription: invoice.serviceDescription,
    taxFacts: copyCreditTaxFacts(invoice),
    totals: {
      gross: negateDecimal(invoice.totals.gross),
      net: negateDecimal(invoice.totals.net),
      vat: negateDecimal(invoice.totals.vat),
    },
  });
}

type AttachRetainedCreditNotePdfOptions = Readonly<{
  pdf: RetainedCreditNotePdf;
  snapshot: CreditNoteSnapshot;
}>;

export function attachRetainedCreditNotePdf({
  pdf,
  snapshot,
}: AttachRetainedCreditNotePdfOptions): CreditNote {
  return persistedCreditNoteSchema.parse({ ...snapshot, retainedPdf: pdf });
}

function copyCreditTaxFacts(invoice: IssuedInvoice): CreditNoteTaxFacts {
  if (invoice.taxFacts.kind !== "foreign-currency-uk-vat") return invoice.taxFacts;
  return creditNoteTaxFactsSchema.parse({
    ...invoice.taxFacts,
    sterlingVatSummary: {
      ...invoice.taxFacts.sterlingVatSummary,
      totals: {
        gross: negateDecimal(invoice.taxFacts.sterlingVatSummary.totals.gross),
        net: negateDecimal(invoice.taxFacts.sterlingVatSummary.totals.net),
        vat: negateDecimal(invoice.taxFacts.sterlingVatSummary.totals.vat),
      },
    },
  });
}

function negateDecimal(value: string): string {
  return /^0(?:\.0+)?$/u.test(value) ? value : `-${value}`;
}

function normalizeCorrectionReason(value: string): NormalizedField {
  const result = normalizeRequiredMultiline(value, "Enter the genuine reason for this correction.");
  if (result.kind === "invalid") return result;
  return /\bbad\s+debt\b/iu.test(result.value)
    ? {
        kind: "invalid",
        message: "Enter a genuine correction reason. Bad debt is not a correction reason.",
      }
    : result;
}
