import { z } from "zod";

import { persistedClientsSchema } from "../../domain/clients/client.js";
import {
  creditNoteMatchesInvoice,
  persistedCreditNotesSchema,
} from "../../domain/invoices/credit-note.js";
import { persistedInvoiceDraftSchema } from "../../domain/invoices/invoice-draft.js";
import { createExchangeDraft } from "../../domain/invoices/exchange-draft.js";
import { persistedIssuedInvoicesSchema } from "../../domain/invoices/issued-invoice.js";
import { replacementDraftSourceSchema } from "../../domain/invoices/replacement.js";
import { replacementDraftHasValidSource } from "../../domain/invoices/replacement.js";
import { persistedIssuerSettingsSchema } from "../../domain/issuer/issuer-settings.js";
import type { WorkspaceState } from "../../application/workspace.js";
import { WorkspaceRecoveryError } from "../../application/workspace-recovery.js";
import {
  releasedWorkspaceStateV1Schema,
  releasedWorkspaceStateV2Schema,
  releasedWorkspaceStateV3Schema,
  releasedWorkspaceStateV4Schema,
  releasedWorkspaceStateV5Schema,
  releasedWorkspaceStateV6Schema,
} from "./released-workspace-state-schemas.js";
import { upgradeSchemaSixWorkspaceState } from "./workspace-state-migration.js";

const emptyListSchema = z.tuple([]).readonly();
const workspaceStateFields = {
  issuer: persistedIssuerSettingsSchema.nullable(),
  voidedInvoiceNumbers: emptyListSchema,
} as const;
const workspaceStateRecordSchema = z
  .strictObject({
    ...workspaceStateFields,
    schemaVersion: z.literal(7),
    clients: persistedClientsSchema,
    creditNotes: persistedCreditNotesSchema,
    draft: z
      .discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("ordinary"), draft: persistedInvoiceDraftSchema }),
        z.strictObject({
          kind: z.literal("replacement"),
          draft: persistedInvoiceDraftSchema,
          source: replacementDraftSourceSchema,
        }),
      ])
      .nullable(),
    issuedInvoices: persistedIssuedInvoicesSchema,
  })
  .readonly();
const workspaceStateSchema = workspaceStateRecordSchema.superRefine(checkWorkspaceRelationships);

const schemaVersionSchema = z.looseObject({ schemaVersion: z.number().int() });
type JsonValue = boolean | null | number | string | readonly JsonValue[] | JsonObject;
type JsonObject = Readonly<{ [key: string]: JsonValue }>;

export function parseWorkspaceState(stateJson: string): WorkspaceState {
  let parsedState: JsonValue;
  try {
    parsedState = JSON.parse(stateJson);
  } catch {
    throw new WorkspaceRecoveryError("malformed");
  }

  const schemaVersionResult = schemaVersionSchema.safeParse(parsedState);
  if (!schemaVersionResult.success) throw new WorkspaceRecoveryError("invalid-schema");
  if (schemaVersionResult.data.schemaVersion > 7) {
    throw new WorkspaceRecoveryError("newer-version");
  }

  switch (schemaVersionResult.data.schemaVersion) {
    case 1:
      return upgradeSchemaOneWorkspaceState(
        parseReleasedWorkspaceState(releasedWorkspaceStateV1Schema, parsedState),
      );
    case 2:
      return upgradeSchemaTwoWorkspaceState(
        parseReleasedWorkspaceState(releasedWorkspaceStateV2Schema, parsedState),
      );
    case 3:
      return upgradeSchemaThreeWorkspaceState(
        parseReleasedWorkspaceState(releasedWorkspaceStateV3Schema, parsedState),
      );
    case 4:
      return upgradeSchemaFourWorkspaceState(
        parseReleasedWorkspaceState(releasedWorkspaceStateV4Schema, parsedState),
      );
    case 5:
      return upgradeSchemaFiveWorkspaceState(
        parseReleasedWorkspaceState(releasedWorkspaceStateV5Schema, parsedState),
      );
    case 6:
      return parseMigratedWorkspaceState(
        parseReleasedWorkspaceState(releasedWorkspaceStateV6Schema, parsedState),
      );
    case 7:
      return parseCurrentWorkspaceState(parseCurrentWorkspaceRecord(parsedState));
    default:
      throw new WorkspaceRecoveryError("invalid-schema");
  }
}

function upgradeSchemaOneWorkspaceState(
  legacyState: z.output<typeof releasedWorkspaceStateV1Schema>,
): WorkspaceState {
  const {
    clients,
    invoiceDraft,
    replacementLinks: _replacementLinks,
    schemaVersion: _schemaVersion,
    ...workspace
  } = legacyState;
  return parseMigratedWorkspaceState({
    ...workspace,
    schemaVersion: 6,
    clients: removeCreditNoteSequences(clients),
    draft: invoiceDraft ? { kind: "ordinary", draft: upgradeSchemaOneDraft(invoiceDraft) } : null,
    issuedInvoices: legacyState.issuedInvoices.map(upgradeSchemaTwoIssuedInvoice),
  });
}

function upgradeSchemaTwoWorkspaceState(
  legacyState: z.output<typeof releasedWorkspaceStateV2Schema>,
): WorkspaceState {
  const {
    clients,
    invoiceDraft,
    replacementLinks: _replacementLinks,
    schemaVersion: _schemaVersion,
    ...workspace
  } = legacyState;
  return parseMigratedWorkspaceState({
    ...workspace,
    schemaVersion: 6,
    clients: removeCreditNoteSequences(clients),
    draft: invoiceDraft
      ? {
          kind: "ordinary",
          draft:
            invoiceDraft.vatTreatment === "uk-taxable"
              ? {
                  ...invoiceDraft,
                  exchange: createExchangeDraft(invoiceDraft.currencyCode),
                }
              : invoiceDraft,
        }
      : null,
    issuedInvoices: legacyState.issuedInvoices.map(upgradeSchemaTwoIssuedInvoice),
  });
}

function upgradeSchemaThreeWorkspaceState(
  legacyState: z.output<typeof releasedWorkspaceStateV3Schema>,
): WorkspaceState {
  const {
    clients,
    invoiceDraft,
    replacementLinks: _replacementLinks,
    schemaVersion: _schemaVersion,
    ...workspace
  } = legacyState;
  return parseMigratedWorkspaceState({
    ...workspace,
    schemaVersion: 6,
    clients: removeCreditNoteSequences(clients),
    draft: invoiceDraft ? { kind: "ordinary", draft: invoiceDraft } : null,
  });
}

function upgradeSchemaFourWorkspaceState(
  legacyState: z.output<typeof releasedWorkspaceStateV4Schema>,
): WorkspaceState {
  const {
    clients,
    invoiceDraft,
    replacementLinks: _replacementLinks,
    schemaVersion: _schemaVersion,
    ...workspace
  } = legacyState;
  return parseMigratedWorkspaceState({
    ...workspace,
    schemaVersion: 6,
    clients: removeCreditNoteSequences(clients),
    draft: invoiceDraft ? { kind: "ordinary", draft: invoiceDraft } : null,
  });
}

function upgradeSchemaFiveWorkspaceState(
  legacyState: z.output<typeof releasedWorkspaceStateV5Schema>,
): WorkspaceState {
  const {
    invoiceDraft,
    replacementLinks: _replacementLinks,
    schemaVersion: _schemaVersion,
    ...workspace
  } = legacyState;
  return parseMigratedWorkspaceState({
    ...workspace,
    schemaVersion: 6,
    draft: invoiceDraft ? { kind: "ordinary", draft: invoiceDraft } : null,
  });
}

type ReleasedSchemaTwoInvoice = z.output<
  typeof releasedWorkspaceStateV2Schema
>["issuedInvoices"][number];

function upgradeSchemaTwoIssuedInvoice(invoice: ReleasedSchemaTwoInvoice) {
  const { vatTreatment, ...invoiceFields } = invoice;
  return {
    ...invoiceFields,
    taxFacts:
      vatTreatment.kind === "outside-scope"
        ? { kind: "outside-scope" as const, vatTreatment }
        : { kind: "gbp-uk-vat" as const, vatTreatment },
  };
}

type ReleasedSchemaOneDraft = NonNullable<
  z.output<typeof releasedWorkspaceStateV1Schema>["invoiceDraft"]
>;

function upgradeSchemaOneDraft(draft: ReleasedSchemaOneDraft) {
  if (!("vatTreatment" in draft)) return { ...draft, vatTreatment: "outside-scope" as const };
  if (draft.vatTreatment === "uk-taxable") {
    const {
      outsideScopeEvidenceReference: _outsideScopeEvidenceReference,
      reverseCharge: _reverseCharge,
      ...ukTaxableDraft
    } = draft;
    return { ...ukTaxableDraft, exchange: createExchangeDraft(draft.currencyCode) };
  }

  const { taxPoint: _taxPoint, vatRate: _vatRate, ...outsideScopeDraft } = draft;
  return outsideScopeDraft;
}

function removeCreditNoteSequences<Client extends Readonly<{ creditNoteSequence: unknown }>>(
  clients: readonly Client[],
) {
  return clients.map(({ creditNoteSequence: _creditNoteSequence, ...client }) => client);
}

function parseReleasedWorkspaceState<Output>(schema: z.ZodType<Output>, state: JsonValue): Output {
  const result = schema.safeParse(state);
  if (!result.success) throw new WorkspaceRecoveryError("invalid-schema");
  return result.data;
}

function parseCurrentWorkspaceRecord(
  state: JsonValue,
): z.output<typeof workspaceStateRecordSchema> {
  const result = workspaceStateRecordSchema.safeParse(state);
  if (!result.success) throw new WorkspaceRecoveryError("invalid-schema");
  return result.data;
}

function parseMigratedWorkspaceState(state: JsonValue): WorkspaceState {
  const releasedState = releasedWorkspaceStateV6Schema.safeParse(state);
  if (!releasedState.success) throw new WorkspaceRecoveryError("inconsistent");
  const currentState = workspaceStateRecordSchema.safeParse(
    upgradeSchemaSixWorkspaceState(releasedState.data),
  );
  if (!currentState.success) throw new WorkspaceRecoveryError("inconsistent");
  return parseCurrentWorkspaceState(currentState.data);
}

function parseCurrentWorkspaceState(
  state: z.input<typeof workspaceStateRecordSchema>,
): WorkspaceState {
  const consistentState = workspaceStateSchema.safeParse(state);
  if (!consistentState.success) throw new WorkspaceRecoveryError("inconsistent");
  return consistentState.data;
}

function checkWorkspaceRelationships(
  workspace: WorkspaceState,
  context: z.core.$RefinementCtx,
): void {
  checkDraftClient(workspace, context);
  for (const [index, creditNote] of workspace.creditNotes.entries()) {
    const invoice = workspace.issuedInvoices.find(({ id }) => id === creditNote.originalInvoiceId);
    if (!invoice || !creditNoteMatchesInvoice(creditNote, invoice)) {
      context.addIssue({
        code: "custom",
        message: "A credit note must exactly reverse one retained invoice.",
        path: ["creditNotes", index],
      });
    }
  }
  checkReplacementDraft(workspace, context);
  checkIssuedReplacementRelationships(workspace, context);
}

function checkDraftClient(workspace: WorkspaceState, context: z.core.$RefinementCtx): void {
  const workspaceDraft = workspace.draft;
  if (!workspaceDraft) return;
  if (workspace.clients.some(({ id }) => id === workspaceDraft.draft.clientId)) return;
  context.addIssue({
    code: "custom",
    message: "An invoice draft must reference a saved client.",
    path: ["draft", "draft", "clientId"],
  });
}

function checkReplacementDraft(workspace: WorkspaceState, context: z.core.$RefinementCtx): void {
  if (!replacementDraftHasValidSource(workspace)) {
    context.addIssue({
      code: "custom",
      message: "A replacement draft must link one fully credited invoice.",
      path: ["draft"],
    });
  }
}

function checkIssuedReplacementRelationships(
  workspace: WorkspaceState,
  context: z.core.$RefinementCtx,
): void {
  const replacedInvoiceIds = new Set<string>();
  for (const [index, replacement] of workspace.issuedInvoices.entries()) {
    const originalInvoiceId = replacement.replacesInvoiceId;
    if (!originalInvoiceId) continue;
    const original = workspace.issuedInvoices.find(({ id }) => id === originalInvoiceId);
    const creditNote = workspace.creditNotes.find(
      ({ originalInvoiceId: creditedInvoiceId }) => creditedInvoiceId === originalInvoiceId,
    );
    const timestampsAreOrdered = creditNote
      ? creditNote.issue.timestamp <= replacement.issue.timestamp
      : false;
    if (
      !original ||
      original.id === replacement.id ||
      !creditNote ||
      !timestampsAreOrdered ||
      replacedInvoiceIds.has(originalInvoiceId)
    ) {
      context.addIssue({
        code: "custom",
        message: "An issued replacement must follow one fully credited invoice.",
        path: ["issuedInvoices", index, "replacesInvoiceId"],
      });
    }
    replacedInvoiceIds.add(originalInvoiceId);
  }
}

export function serializeWorkspaceState(state: WorkspaceState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}
