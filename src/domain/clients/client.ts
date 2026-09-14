import { z } from "zod";

import { findCurrency, persistedCurrencySchema } from "../money/currency.ts";
import { fractionalDigitCount, normalizePositiveDecimal } from "../money/decimal.ts";
import {
  createFieldSchemas,
  type NormalizedField,
  normalizeBoundedField,
  normalizeOptionalMultiline,
  normalizeRequiredMultiline,
  normalizeRequiredSingleLine,
} from "../validation/text-field.ts";
import { normalizeVatRate } from "../tax/vat-rate.ts";
import {
  outsideScopeVatWording,
  outsideScopeWording,
  reverseChargeWording,
  ukTaxableWording,
} from "../tax/vat-wording.ts";

const legalNameSchemas = createFieldSchemas<"ClientLegalName">((value) =>
  normalizeRequiredSingleLine(value, "Enter the client's legal name."),
);
const postalAddressSchemas = createFieldSchemas<"ClientPostalAddress">((value) =>
  normalizeRequiredMultiline(value, "Enter the client's postal address."),
);
const dayRateSchemas = createFieldSchemas<"DayRate">((value) => {
  const result = normalizePositiveDecimal(value);
  return result.kind === "invalid"
    ? {
        kind: "invalid",
        message:
          result.message === "Enter a positive amount."
            ? "Enter a positive day rate."
            : result.message === "Enter an amount greater than zero."
              ? "Enter a day rate greater than zero."
              : result.message,
      }
    : result;
});
const vatRateSchemas = createFieldSchemas<"VatRate">(normalizeVatRate);
const outsideScopeEvidenceSchemas = createFieldSchemas<"OutsideScopeEvidenceReference">((value) =>
  normalizeRequiredMultiline(value, "Enter an outside-scope evidence reference."),
);
const serviceDescriptionSchemas = createFieldSchemas<"ServiceDescription">(
  normalizeOptionalMultiline,
);
const paymentTermsSchemas = createFieldSchemas<"PaymentTerms">((value) =>
  normalizeRequiredSingleLine(value, "Enter the client's payment terms."),
);
const prefixSchemas = createFieldSchemas<"DocumentPrefix">(normalizePrefix);
const sequenceNumberSchemas = createFieldSchemas<"SequenceNumber">(normalizePositiveInteger);

const clientInputFields = {
  legalName: z.string(),
  postalAddress: z.string(),
  currencyCode: z.string(),
  standardDayRate: z.string(),
  vatTreatment: z.enum(["uk-taxable", "outside-scope"]),
  vatRate: z.string(),
  outsideScopeEvidenceReference: z.string(),
  reverseCharge: z.boolean(),
  defaultServiceDescription: z.string(),
  paymentTerms: z.string(),
  invoicePrefix: z.string(),
  nextInvoiceNumber: z.string(),
};
const clientInputFieldsSchema = z.strictObject({
  ...clientInputFields,
  legalName: legalNameSchemas.input,
  postalAddress: postalAddressSchemas.input,
  currencyCode: z.string().transform((value, context) => {
    const currency = findCurrency(value);
    if (currency) return persistedCurrencySchema.parse(currency);
    context.addIssue({ code: "custom", message: "Choose a current ISO 4217 currency." });
    return z.NEVER;
  }),
  standardDayRate: dayRateSchemas.input,
  defaultServiceDescription: serviceDescriptionSchemas.input,
  paymentTerms: paymentTermsSchemas.input,
  invoicePrefix: prefixSchemas.input,
  nextInvoiceNumber: sequenceNumberSchemas.input,
});

const persistedVatTreatmentSchema = z.discriminatedUnion("kind", [
  z
    .strictObject({
      kind: z.literal("uk-taxable"),
      rate: vatRateSchemas.persisted,
      wording: z.literal(ukTaxableWording),
    })
    .readonly(),
  z
    .strictObject({
      kind: z.literal("outside-scope"),
      evidenceReference: outsideScopeEvidenceSchemas.persisted,
      reverseCharge: z.boolean(),
      wording: z.union([z.literal(outsideScopeWording), z.literal(reverseChargeWording)]),
    })
    .superRefine((treatment, context) => {
      const expectedWording = outsideScopeVatWording(treatment.reverseCharge);
      if (treatment.wording !== expectedWording) {
        context.addIssue({ code: "custom", message: "Use the matching VAT wording." });
      }
    })
    .readonly(),
]);

const sequenceSchema = z
  .strictObject({
    prefix: prefixSchemas.persisted,
    nextNumber: sequenceNumberSchemas.persisted,
  })
  .readonly();
export const clientIdSchema = z.uuid().brand<"ClientId">();

const persistedClientFields = {
  legalName: legalNameSchemas.persisted,
  postalAddress: postalAddressSchemas.persisted,
  currency: persistedCurrencySchema,
  standardDayRate: dayRateSchemas.persisted,
  vatTreatment: persistedVatTreatmentSchema,
  defaultServiceDescription: serviceDescriptionSchemas.persisted,
  paymentTerms: paymentTermsSchemas.persisted,
  invoiceSequence: sequenceSchema,
};
const persistedClientFieldsObjectSchema = z.strictObject(persistedClientFields);
type PersistedClientFields = z.output<typeof persistedClientFieldsObjectSchema>;
const persistedClientFieldsSchema = persistedClientFieldsObjectSchema
  .superRefine(addPersistedClientInvariantIssues)
  .readonly();

export const persistedClientSchema = z
  .strictObject({
    id: clientIdSchema,
    ...persistedClientFields,
  })
  .superRefine(addPersistedClientInvariantIssues)
  .brand<"Client">();

export const persistedClientsSchema = z
  .array(persistedClientSchema)
  .superRefine(addClientCollectionInvariantIssues)
  .readonly();

const clientInputSchema = clientInputFieldsSchema
  .superRefine((fields, context) => {
    if (fractionalDigitCount(fields.standardDayRate) > fields.currencyCode.minorUnit) {
      context.addIssue({
        code: "custom",
        path: ["standardDayRate"],
        message: `Use no more than ${fields.currencyCode.minorUnit} decimal places for ${fields.currencyCode.code}.`,
      });
    }

    if (fields.vatTreatment === "uk-taxable") {
      addNormalizationIssue(fields.vatRate, normalizeVatRate, "vatRate", context);
    } else {
      addNormalizationIssue(
        fields.outsideScopeEvidenceReference,
        (value) => normalizeRequiredMultiline(value, "Enter an outside-scope evidence reference."),
        "outsideScopeEvidenceReference",
        context,
      );
    }
  })
  .transform((fields, context) => {
    const result = persistedClientFieldsSchema.safeParse({
      legalName: fields.legalName,
      postalAddress: fields.postalAddress,
      currency: fields.currencyCode,
      standardDayRate: fields.standardDayRate,
      vatTreatment:
        fields.vatTreatment === "uk-taxable"
          ? {
              kind: "uk-taxable",
              rate: normalizeValidField(fields.vatRate, normalizeVatRate),
              wording: ukTaxableWording,
            }
          : {
              kind: "outside-scope",
              evidenceReference: normalizeValidField(
                fields.outsideScopeEvidenceReference,
                (value) =>
                  normalizeRequiredMultiline(value, "Enter an outside-scope evidence reference."),
              ),
              reverseCharge: fields.reverseCharge,
              wording: outsideScopeVatWording(fields.reverseCharge),
            },
      defaultServiceDescription: fields.defaultServiceDescription,
      paymentTerms: fields.paymentTerms,
      invoiceSequence: {
        prefix: fields.invoicePrefix,
        nextNumber: fields.nextInvoiceNumber,
      },
    });
    if (result.success) return result.data;

    for (const issue of result.error.issues) {
      context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
    return z.NEVER;
  });

export function createClientFormSchema(
  clients: readonly Client[],
  currentClientId: ClientId | null,
) {
  return clientInputSchema.superRefine((client, context) => {
    for (const error of findCollisionErrors(client, clients, currentClientId)) {
      context.addIssue({ code: "custom", path: [error.fieldName], message: error.message });
    }
  });
}

const clientFieldNameSchema = clientInputFieldsSchema.keyof();
const rawClientInputSchema = z.strictObject(clientInputFields);

export type ClientId = z.output<typeof persistedClientSchema>["id"];
export type Client = Readonly<z.output<typeof persistedClientSchema>>;
export type ClientFields = Readonly<z.output<typeof persistedClientFieldsSchema>>;
export type ClientInput = Readonly<z.input<typeof clientInputSchema>>;
export type ClientFieldName = z.output<typeof clientFieldNameSchema>;
export type ClientFieldError = Readonly<{
  fieldName: ClientFieldName;
  message: string;
}>;
export type ClientFieldErrors = readonly ClientFieldError[];
export type ClientValidationResult =
  | Readonly<{ kind: "valid"; client: ClientFields }>
  | Readonly<{
      kind: "invalid";
      reason: "malformed" | "details" | "collision";
      errors: ClientFieldErrors;
    }>;

export type ClientDefaults = Readonly<{
  clientId: ClientId;
  legalName: Client["legalName"];
  postalAddress: Client["postalAddress"];
  currency: Client["currency"];
  standardDayRate: Client["standardDayRate"];
  vatTreatment: Client["vatTreatment"];
  defaultServiceDescription: Client["defaultServiceDescription"];
  paymentTerms: Client["paymentTerms"];
  nextInvoiceId: string;
}>;

export const emptyClientInput: ClientInput = {
  legalName: "",
  postalAddress: "",
  currencyCode: "GBP",
  standardDayRate: "",
  vatTreatment: "uk-taxable",
  vatRate: "",
  outsideScopeEvidenceReference: "",
  reverseCharge: false,
  defaultServiceDescription: "",
  paymentTerms: "Due within 30 days",
  invoicePrefix: "",
  nextInvoiceNumber: "1",
};

export function createNewClientInput(standardVatRate: string | null): ClientInput {
  return { ...emptyClientInput, vatRate: standardVatRate ?? "" };
}

type UntrustedClientInput = Parameters<typeof clientInputSchema.safeParse>[0];

export function parseClientInputFields(
  value: Parameters<typeof rawClientInputSchema.parse>[0],
): ClientInput {
  return rawClientInputSchema.parse(value);
}

export function validateClientInput(
  input: UntrustedClientInput,
  clients: readonly Client[],
  currentClientId: ClientId | null,
): ClientValidationResult {
  const result = clientInputSchema.safeParse(input);
  if (!result.success) {
    const errors = collectClientFieldErrors(result.error);
    return {
      kind: "invalid",
      reason: errors.length > 0 ? "details" : "malformed",
      errors,
    };
  }

  const collisionErrors = findCollisionErrors(result.data, clients, currentClientId);
  return collisionErrors.length > 0
    ? { kind: "invalid", reason: "collision", errors: collisionErrors }
    : { kind: "valid", client: result.data };
}

export function clientToInput(client: Client): ClientInput {
  return {
    legalName: client.legalName,
    postalAddress: client.postalAddress,
    currencyCode: client.currency.code,
    standardDayRate: client.standardDayRate,
    vatTreatment: client.vatTreatment.kind,
    vatRate: client.vatTreatment.kind === "uk-taxable" ? client.vatTreatment.rate : "",
    outsideScopeEvidenceReference:
      client.vatTreatment.kind === "outside-scope" ? client.vatTreatment.evidenceReference : "",
    reverseCharge:
      client.vatTreatment.kind === "outside-scope" && client.vatTreatment.reverseCharge,
    defaultServiceDescription: client.defaultServiceDescription,
    paymentTerms: client.paymentTerms,
    invoicePrefix: client.invoiceSequence.prefix,
    nextInvoiceNumber: client.invoiceSequence.nextNumber,
  };
}

export function copyClientToNewInput(client: Client): ClientInput {
  return {
    ...clientToInput(client),
    invoicePrefix: "",
    nextInvoiceNumber: "1",
  };
}

export function copyClientDefaults(client: Client): ClientDefaults {
  return {
    clientId: client.id,
    legalName: client.legalName,
    postalAddress: client.postalAddress,
    currency: { ...client.currency },
    standardDayRate: client.standardDayRate,
    vatTreatment: { ...client.vatTreatment },
    defaultServiceDescription: client.defaultServiceDescription,
    paymentTerms: client.paymentTerms,
    nextInvoiceId: formatDocumentId(
      client.invoiceSequence.prefix,
      client.invoiceSequence.nextNumber,
    ),
  };
}

export function formatDocumentId(prefix: string, number: string): string {
  return `${prefix}-${number.padStart(4, "0")}`;
}

function findCollisionErrors(
  client: ClientFields,
  clients: readonly Client[],
  currentClientId: ClientId | null,
): ClientFieldError[] {
  const otherClients = clients.filter(({ id }) => id !== currentClientId);
  const usedPrefixes = new Set(
    otherClients.map(({ invoiceSequence }) => invoiceSequence.prefix.toUpperCase()),
  );
  const usedIdentifiers = new Set(
    otherClients.map(({ invoiceSequence }) =>
      formatDocumentId(invoiceSequence.prefix, invoiceSequence.nextNumber).toUpperCase(),
    ),
  );
  const error = findSequenceCollision(client.invoiceSequence, usedPrefixes, usedIdentifiers);
  return error ? [error] : [];
}

function findSequenceCollision(
  sequence: ClientFields["invoiceSequence"],
  usedPrefixes: ReadonlySet<string>,
  usedIdentifiers: ReadonlySet<string>,
): ClientFieldError | undefined {
  const prefixIsUsed = usedPrefixes.has(sequence.prefix.toUpperCase());
  const identifierIsUsed = usedIdentifiers.has(
    formatDocumentId(sequence.prefix, sequence.nextNumber).toUpperCase(),
  );
  if (!prefixIsUsed && !identifierIsUsed) return undefined;

  return {
    fieldName: "invoicePrefix",
    message: prefixIsUsed
      ? "Choose a prefix that no other sequence uses."
      : "The next document identifier is already in use.",
  };
}

function collectClientFieldErrors(error: z.ZodError): ClientFieldErrors {
  return error.issues.flatMap((issue) => {
    const fieldName = clientFieldNameSchema.safeParse(issue.path[0]);
    if (!fieldName.success) return [];
    return [{ fieldName: fieldName.data, message: issue.message }];
  });
}

function normalizePositiveInteger(value: string): NormalizedField {
  const normalizedField = normalizeBoundedField(value, 200);
  if (normalizedField.kind === "invalid") return normalizedField;
  const normalizedValue = normalizedField.value;
  if (!/^\d+$/u.test(normalizedValue) || BigInt(normalizedValue) === 0n) {
    return { kind: "invalid", message: "Enter a positive whole number." };
  }
  return { kind: "valid", value: BigInt(normalizedValue).toString() };
}

function normalizePrefix(value: string): NormalizedField {
  const normalizedValue = value.normalize("NFC").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/u.test(normalizedValue)) {
    return { kind: "invalid", message: "Use 2 to 12 letters or digits without a hyphen." };
  }
  return { kind: "valid", value: normalizedValue };
}

function addPersistedClientInvariantIssues(
  client: PersistedClientFields,
  context: z.RefinementCtx,
): void {
  if (fractionalDigitCount(client.standardDayRate) > client.currency.minorUnit) {
    context.addIssue({
      code: "custom",
      path: ["standardDayRate"],
      message: `Use no more than ${client.currency.minorUnit} decimal places for ${client.currency.code}.`,
    });
  }
}

function addClientCollectionInvariantIssues(
  clients: readonly Client[],
  context: z.RefinementCtx,
): void {
  const clientIdOwnerIndexes = new Map<string, number>();
  const prefixOwnerIndexes = new Map<string, number>();
  const identifierOwnerIndexes = new Map<string, number>();

  for (const [clientIndex, client] of clients.entries()) {
    registerUniqueClientValue({
      clientIndex,
      collisionLabel: "client ID",
      context,
      ownerIndexes: clientIdOwnerIndexes,
      path: [clientIndex, "id"],
      value: client.id,
    });

    registerUniqueClientValue({
      clientIndex,
      collisionLabel: "prefix",
      context,
      ownerIndexes: prefixOwnerIndexes,
      path: [clientIndex, "invoiceSequence", "prefix"],
      value: client.invoiceSequence.prefix.toUpperCase(),
    });
    registerUniqueClientValue({
      clientIndex,
      collisionLabel: "document identifier",
      context,
      ownerIndexes: identifierOwnerIndexes,
      path: [clientIndex, "invoiceSequence", "nextNumber"],
      value: formatDocumentId(
        client.invoiceSequence.prefix,
        client.invoiceSequence.nextNumber,
      ).toUpperCase(),
    });
  }
}

type UniqueClientValue = Readonly<{
  clientIndex: number;
  collisionLabel: "client ID" | "prefix" | "document identifier";
  context: z.RefinementCtx;
  ownerIndexes: Map<string, number>;
  path: PropertyKey[];
  value: string;
}>;

function registerUniqueClientValue({
  clientIndex,
  collisionLabel,
  context,
  ownerIndexes,
  path,
  value,
}: UniqueClientValue): void {
  const ownerIndex = ownerIndexes.get(value);
  if (ownerIndex === undefined) {
    ownerIndexes.set(value, clientIndex);
    return;
  }
  if (ownerIndex === clientIndex) return;

  context.addIssue({
    code: "custom",
    path,
    message: `Use a ${collisionLabel} that differs from client ${ownerIndex + 1}.`,
  });
}

function addNormalizationIssue(
  value: string,
  normalize: (value: string) => NormalizedField,
  fieldName: ClientFieldName,
  context: z.RefinementCtx,
): void {
  const result = normalize(value);
  if (result.kind === "invalid") {
    context.addIssue({ code: "custom", path: [fieldName], message: result.message });
  }
}

function normalizeValidField(value: string, normalize: (value: string) => NormalizedField): string {
  const result = normalize(value);
  if (result.kind === "invalid") throw new Error("Expected a valid client field");
  return result.value;
}
