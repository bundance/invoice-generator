import {
  type ClientInput,
  persistedClientSchema,
  validateClientInput,
} from "../../src/domain/clients/client.js";

export const completeClientInput = {
  legalName: "Genesis Global",
  postalAddress: "123 Market Street\nNew York\nNY 10001",
  currencyCode: "USD",
  standardDayRate: "725",
  vatTreatment: "outside-scope",
  vatRate: "",
  outsideScopeEvidenceReference: "Contract and tax certificate",
  reverseCharge: true,
  defaultServiceDescription: "React Native consultancy\nProject delivery",
  paymentTerms: "Due within 30 days",
  invoicePrefix: "GGIOHK",
  nextInvoiceNumber: "43",
} as const;

const completeClientValidation = validateClientInput(completeClientInput, [], null);
if (completeClientValidation.kind === "invalid") {
  throw new Error("The complete client fixture must remain valid");
}
export const completeClientFields = completeClientValidation.client;

export const completeClient = persistedClientSchema.parse({
  id: "5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc",
  ...completeClientFields,
});

export const completeGbpVatClientInput = {
  ...completeClientInput,
  legalName: "Acme Research Ltd",
  postalAddress: "9 High Street\nReading\nBerkshire\nRG1 1AA",
  currencyCode: "GBP",
  standardDayRate: "725",
  vatTreatment: "uk-taxable",
  vatRate: "20",
  outsideScopeEvidenceReference: "",
  reverseCharge: false,
  invoicePrefix: "ACME",
  nextInvoiceNumber: "8",
} satisfies ClientInput;

const completeGbpVatClientValidation = validateClientInput(completeGbpVatClientInput, [], null);
if (completeGbpVatClientValidation.kind === "invalid") {
  throw new Error("The complete GBP VAT client fixture must remain valid");
}

export const completeGbpVatClient = persistedClientSchema.parse({
  id: "647253f4-113c-4d84-8381-c219776b7469",
  ...completeGbpVatClientValidation.client,
});

export const completeForeignCurrencyVatClientInput = {
  ...completeGbpVatClientInput,
  currencyCode: "USD",
  invoicePrefix: "USDVAT",
  legalName: "Acme Research US",
  nextInvoiceNumber: "12",
  postalAddress: "45 Madison Avenue\nNew York\nNY 10010",
} satisfies ClientInput;

const completeForeignCurrencyVatClientValidation = validateClientInput(
  completeForeignCurrencyVatClientInput,
  [],
  null,
);
if (completeForeignCurrencyVatClientValidation.kind === "invalid") {
  throw new Error("The complete foreign-currency VAT client fixture must remain valid");
}

export const completeForeignCurrencyVatClient = persistedClientSchema.parse({
  id: "542730bb-57c3-4d73-a0e7-af1cc90fe917",
  ...completeForeignCurrencyVatClientValidation.client,
});
