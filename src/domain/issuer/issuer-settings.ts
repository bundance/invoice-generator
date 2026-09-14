import { z } from "zod";

import {
  createFieldSchemas,
  hasDisallowedControlCharacter,
  type NormalizedField,
  normalizeRequiredMultiline,
  normalizeRequiredSingleLine,
} from "../validation/text-field.ts";
import { normalizeVatRate } from "../tax/vat-rate.ts";

const issuerWordmark = "codernetic";
const legalNameSchemas = createFieldSchemas<"IssuerLegalName">((value) =>
  normalizeRequiredSingleLine(value, "Enter the issuer's legal name."),
);
const registeredAddressSchemas = createFieldSchemas<"RegisteredAddress">((value) =>
  normalizeRequiredMultiline(value, "Enter the issuer's registered address."),
);
const companyNumberSchemas = createFieldSchemas<"CompanyNumber">(normalizeCompanyNumber);
const vatRegistrationNumberSchemas = createFieldSchemas<"VatRegistrationNumber">(
  normalizeVatRegistrationNumber,
);
const bankNameSchemas = createFieldSchemas<"BankName">((value) =>
  normalizeRequiredSingleLine(value, "Enter the issuer's bank name."),
);
const sortCodeSchemas = createFieldSchemas<"SortCode">(normalizeSortCode);
const accountNumberSchemas = createFieldSchemas<"AccountNumber">(normalizeAccountNumber);
const standardVatRateSchemas = createFieldSchemas<"VatRate">(normalizeVatRate);
const businessTimezoneSchemas = createFieldSchemas<"BusinessTimezone">(normalizeBusinessTimezone);
export type BusinessTimezone = z.output<typeof businessTimezoneSchemas.persisted>;
export const defaultBusinessTimezone = businessTimezoneSchemas.persisted.parse("Europe/London");

const issuerInputFieldsSchema = z.strictObject({
  legalName: legalNameSchemas.input,
  registeredAddress: registeredAddressSchemas.input,
  companyNumber: companyNumberSchemas.input,
  vatRegistrationNumber: vatRegistrationNumberSchemas.input,
  bankName: bankNameSchemas.input,
  sortCode: sortCodeSchemas.input,
  accountNumber: accountNumberSchemas.input,
  standardVatRate: standardVatRateSchemas.input,
  businessTimezone: businessTimezoneSchemas.input,
});
export const persistedIssuerSettingsSchema = z
  .strictObject({
    legalName: legalNameSchemas.persisted,
    registeredAddress: registeredAddressSchemas.persisted,
    companyNumber: companyNumberSchemas.persisted,
    vatRegistrationNumber: vatRegistrationNumberSchemas.persisted,
    bankName: bankNameSchemas.persisted,
    sortCode: sortCodeSchemas.persisted,
    accountNumber: accountNumberSchemas.persisted,
    standardVatRate: standardVatRateSchemas.persisted,
    businessTimezone: businessTimezoneSchemas.persisted,
    wordmark: z.literal(issuerWordmark),
  })
  .brand<"IssuerSettings">();
export const issuerSettingsFormSchema = issuerInputFieldsSchema.transform((fields) =>
  persistedIssuerSettingsSchema.parse({ ...fields, wordmark: issuerWordmark }),
);
const issuerInputViewSchema = z.object(issuerInputFieldsSchema.shape);
const issuerFieldNameSchema = issuerInputFieldsSchema.keyof();
const issuerFieldNames = issuerFieldNameSchema.options;

export type IssuerSettingsInput = Readonly<z.input<typeof issuerSettingsFormSchema>>;
export type IssuerSettings = Readonly<z.output<typeof persistedIssuerSettingsSchema>>;
export type IssuerFieldName = z.output<typeof issuerFieldNameSchema>;
export type IssuerFieldError = Readonly<{
  fieldName: IssuerFieldName;
  message: string;
}>;
export type IssuerFieldErrors = readonly [IssuerFieldError, ...IssuerFieldError[]];
export type IssuerValidationResult =
  | Readonly<{ kind: "valid"; issuer: IssuerSettings }>
  | Readonly<{ kind: "invalid"; errors: IssuerFieldErrors }>;

export const emptyIssuerSettingsInput: IssuerSettingsInput = {
  legalName: "",
  registeredAddress: "",
  companyNumber: "",
  vatRegistrationNumber: "",
  bankName: "",
  sortCode: "",
  accountNumber: "",
  standardVatRate: "",
  businessTimezone: defaultBusinessTimezone,
};

type UntrustedIssuerSettings = Parameters<typeof issuerSettingsFormSchema.safeParse>[0];

export function parseIssuerSettingsInput(value: UntrustedIssuerSettings): IssuerSettings {
  const result = issuerSettingsFormSchema.safeParse(value);
  if (result.success) return result.data;

  if (result.error.issues.some((issue) => issue.code !== "custom")) {
    throw new Error("Issuer settings input does not match the expected fields");
  }
  throw new Error("Issuer settings are invalid");
}

export function validateIssuerSettings(input: IssuerSettingsInput): IssuerValidationResult {
  const result = issuerSettingsFormSchema.safeParse(input);
  return result.success
    ? { kind: "valid", issuer: result.data }
    : { kind: "invalid", errors: collectIssuerFieldErrors(result.error) };
}

export function issuerSettingsToInput(issuer: IssuerSettings): IssuerSettingsInput {
  return issuerInputViewSchema.parse(issuer);
}

export function issuerSettingsAreEqual(
  first: IssuerSettings | null,
  second: IssuerSettings,
): boolean {
  return (
    first !== null &&
    issuerFieldNames.every((fieldName) => first[fieldName] === second[fieldName]) &&
    first.wordmark === second.wordmark
  );
}

function collectIssuerFieldErrors(error: z.ZodError): IssuerFieldErrors {
  const errors = error.issues.flatMap((issue) => {
    const fieldName = issuerFieldNameSchema.safeParse(issue.path[0]);
    if (!fieldName.success) return [];

    const fieldError: IssuerFieldError = {
      fieldName: fieldName.data,
      message: issue.message,
    };
    return [fieldError];
  });
  const [firstError, ...otherErrors] = errors;
  if (!firstError) throw new Error("Issuer validation failed without a field error");
  return [firstError, ...otherErrors];
}

function normalizeCompanyNumber(value: string): NormalizedField {
  const normalizedValue = value.normalize("NFC").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/u.test(normalizedValue)) {
    return {
      kind: "invalid",
      message: "Enter 1 to 8 letters or digits in the certificate form.",
    };
  }
  return { kind: "valid", value: normalizedValue };
}

function normalizeVatRegistrationNumber(value: string): NormalizedField {
  if (hasDisallowedControlCharacter(value, false)) {
    return { kind: "invalid", message: "Remove control characters." };
  }
  const normalizedValue = value
    .normalize("NFC")
    .trim()
    .toUpperCase()
    .replace(/^GB\s*/u, "");
  const canonicalValue = normalizedValue.replace(/\s/gu, "");
  if (!/^\d{9}$/u.test(canonicalValue)) {
    return { kind: "invalid", message: "Enter a nine-digit UK VAT registration number." };
  }
  return { kind: "valid", value: canonicalValue };
}

function normalizeSortCode(value: string): NormalizedField {
  return normalizeBankIdentifier(value, 6, "Enter a six-digit sort code.");
}

function normalizeAccountNumber(value: string): NormalizedField {
  return normalizeBankIdentifier(value, 8, "Enter an eight-digit account number.");
}

function normalizeBankIdentifier(
  value: string,
  requiredDigits: 6 | 8,
  invalidMessage: string,
): NormalizedField {
  if (hasDisallowedControlCharacter(value, false)) {
    return { kind: "invalid", message: "Remove control characters." };
  }
  const canonicalValue = value.normalize("NFC").trim().replace(/[\s-]/gu, "");
  if (canonicalValue.length !== requiredDigits || /\D/u.test(canonicalValue)) {
    return { kind: "invalid", message: invalidMessage };
  }
  return { kind: "valid", value: canonicalValue };
}

function normalizeBusinessTimezone(value: string): NormalizedField {
  const normalizedValue = normalizeRequiredSingleLine(
    value,
    "Enter the issuer's IANA business timezone.",
  );
  if (normalizedValue.kind === "invalid") return normalizedValue;

  if (!isRuntimeSupportedTimezone(normalizedValue.value)) {
    return { kind: "invalid", message: "Enter a valid IANA timezone, such as Europe/London." };
  }
  return normalizedValue;
}

function isRuntimeSupportedTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
