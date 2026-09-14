import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  type Client,
  type ClientFieldName,
  type ClientInput,
  copyClientDefaults,
  copyClientToNewInput,
  formatDocumentId,
  parseClientInputFields,
  persistedClientsSchema,
  persistedClientSchema,
  validateClientInput,
} from "./client.ts";
import { currencies } from "../money/currency.ts";
import {
  completeClient,
  completeClientFields,
  completeClientInput,
} from "../../../tests/fixtures/client.ts";

describe("client validation", () => {
  it("normalizes client identity, defaults, VAT wording, and invoice sequence", () => {
    const result = validateClientInput(
      {
        legalName: "  Genesis   Global  ",
        postalAddress: "  123 Market Street\r\nNew York\rNY 10001  ",
        currencyCode: " usd ",
        standardDayRate: "00725.00",
        vatTreatment: "outside-scope",
        vatRate: "",
        outsideScopeEvidenceReference: "  Contract and tax certificate  ",
        reverseCharge: true,
        defaultServiceDescription: "  React Native consultancy\r\nProject delivery  ",
        paymentTerms: "  Due   within 30 days  ",
        invoicePrefix: " ggiohk ",
        nextInvoiceNumber: "00043",
      },
      [],
      null,
    );

    expect(result).toEqual({
      kind: "valid",
      client: completeClientFields,
    });
  });

  it.each([
    { fieldName: "legalName", value: "", label: "legal name is required" },
    { fieldName: "postalAddress", value: "", label: "postal address is required" },
    { fieldName: "currencyCode", value: "BGN", label: "currency must be current" },
    {
      fieldName: "standardDayRate",
      value: "725.001",
      label: "day rate follows currency precision",
    },
    { fieldName: "standardDayRate", value: "0", label: "day rate is positive" },
    { fieldName: "invoicePrefix", value: "A-1", label: "invoice prefix excludes hyphens" },
    {
      fieldName: "nextInvoiceNumber",
      value: "0",
      label: "invoice sequence starts positive",
    },
    {
      fieldName: "outsideScopeEvidenceReference",
      value: "",
      label: "outside-scope evidence is required",
    },
  ] satisfies ReadonlyArray<
    Readonly<{ fieldName: ClientFieldName; value: string; label: string }>
  >)("rejects a client when $label", ({ fieldName, value }) => {
    const result = validateClientInput({ ...completeClientInput, [fieldName]: value }, [], null);

    expect(result.kind).toBe("invalid");
    if (result.kind === "valid") throw new Error("Expected invalid client input");
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldName, message: expect.any(String) })]),
    );
  });

  it("validates day rates against zero, two, and three minor-unit currencies", () => {
    expect(
      validateClientInput(
        { ...completeClientInput, currencyCode: "JPY", standardDayRate: "725" },
        [],
        null,
      ).kind,
    ).toBe("valid");
    expect(
      validateClientInput(
        { ...completeClientInput, currencyCode: "JPY", standardDayRate: "725.5" },
        [],
        null,
      ).kind,
    ).toBe("invalid");
    expect(
      validateClientInput(
        { ...completeClientInput, currencyCode: "USD", standardDayRate: "725.25" },
        [],
        null,
      ).kind,
    ).toBe("valid");
    expect(
      validateClientInput(
        { ...completeClientInput, currencyCode: "KWD", standardDayRate: "725.125" },
        [],
        null,
      ).kind,
    ).toBe("valid");
  });

  it("models UK-taxable defaults without outside-scope fields", () => {
    const result = validateClientInput(
      {
        ...completeClientInput,
        currencyCode: "GBP",
        vatTreatment: "uk-taxable",
        vatRate: "020.000",
        outsideScopeEvidenceReference: "not retained",
        reverseCharge: true,
      },
      [],
      null,
    );

    expect(result).toMatchObject({
      kind: "valid",
      client: {
        vatTreatment: {
          kind: "uk-taxable",
          rate: "20",
          wording: "UK VAT applies.",
        },
      },
    });
  });

  it("preserves meaningful line breaks in outside-scope evidence", () => {
    const result = validateClientInput(
      {
        ...completeClientInput,
        outsideScopeEvidenceReference: "  Contract review\r\nTax certificate  ",
      },
      [],
      null,
    );

    expect(result).toMatchObject({
      kind: "valid",
      client: {
        vatTreatment: {
          kind: "outside-scope",
          evidenceReference: "Contract review\nTax certificate",
        },
      },
    });
  });

  it("rejects prefixes and next identifiers used by another client without rejecting an edit", () => {
    const sameInvoicePrefix = validateClientInput(
      { ...completeClientInput, invoicePrefix: "ggIOhk" },
      [completeClient],
      null,
    );
    const editingCurrentClient = validateClientInput(
      { ...completeClientInput, legalName: "Genesis Global LLC" },
      [completeClient],
      completeClient.id,
    );

    expect(sameInvoicePrefix).toMatchObject({
      kind: "invalid",
      errors: [{ fieldName: "invoicePrefix" }],
    });
    expect(editingCurrentClient.kind).toBe("valid");
  });

  it("accepts sequence values beyond JavaScript's safe integer range", () => {
    const nextNumber = "9007199254740993";
    const result = validateClientInput(
      {
        ...completeClientInput,
        nextInvoiceNumber: nextNumber,
      },
      [],
      null,
    );

    expect(result).toMatchObject({
      kind: "valid",
      client: {
        invoiceSequence: { nextNumber },
      },
    });
    expect(formatDocumentId("GGIOHK", nextNumber)).toBe("GGIOHK-9007199254740993");
  });

  it("preserves a 200-digit sequence value at the normalized field boundary", () => {
    const nextNumber = "1".repeat(200);

    expect(
      validateClientInput({ ...completeClientInput, nextInvoiceNumber: nextNumber }, [], null),
    ).toMatchObject({ kind: "valid", client: { invoiceSequence: { nextNumber } } });
  });

  it.each([
    { fieldName: "standardDayRate", value: "1".repeat(201) },
    { fieldName: "nextInvoiceNumber", value: "1".repeat(201) },
    { fieldName: "vatRate", value: "1".repeat(201) },
  ] satisfies ReadonlyArray<Readonly<{ fieldName: ClientFieldName; value: string }>>)(
    "limits the normalized $fieldName field to 200 characters",
    ({ fieldName, value }) => {
      const result = validateClientInput(
        {
          ...completeClientInput,
          vatTreatment: "uk-taxable",
          vatRate: "20",
          [fieldName]: value,
        },
        [],
        null,
      );

      expect(result).toMatchObject({
        kind: "invalid",
        reason: "details",
        errors: expect.arrayContaining([{ fieldName, message: "Use 200 characters or fewer." }]),
      });
    },
  );

  it("keeps the per-client invariants at the persisted-data boundary", () => {
    expect(
      persistedClientSchema.safeParse({
        ...completeClient,
        standardDayRate: "725.001",
      }).success,
    ).toBe(false);
  });

  it("keeps client IDs and document prefixes unique at the collection boundary", () => {
    const otherClient = persistedClientSchema.parse({
      ...completeClient,
      id: "647253f4-113c-4d84-8381-c219776b7469",
      invoiceSequence: { prefix: "OTHER", nextNumber: "1" },
    });

    expect(
      persistedClientsSchema.safeParse([{ ...otherClient, id: completeClient.id }, completeClient])
        .success,
    ).toBe(false);
    expect(
      persistedClientsSchema.safeParse([
        {
          ...otherClient,
          invoiceSequence: { ...otherClient.invoiceSequence, prefix: "GGIOHK" },
        },
        completeClient,
      ]).success,
    ).toBe(false);
  });

  it("copies current client defaults without consuming the next invoice number", () => {
    const defaults = copyClientDefaults(completeClient);

    expect(defaults).toEqual({
      clientId: completeClient.id,
      legalName: completeClient.legalName,
      postalAddress: completeClient.postalAddress,
      currency: completeClient.currency,
      standardDayRate: completeClient.standardDayRate,
      vatTreatment: completeClient.vatTreatment,
      defaultServiceDescription: completeClient.defaultServiceDescription,
      paymentTerms: completeClient.paymentTerms,
      nextInvoiceId: "GGIOHK-0043",
    });
    expect(completeClient.invoiceSequence.nextNumber).toBe("43");
  });

  it("copies a client into a new record without sharing its invoice sequence", () => {
    expect(copyClientToNewInput(completeClient)).toEqual({
      ...completeClientInput,
      invoicePrefix: "",
      nextInvoiceNumber: "1",
    });
    expect(completeClient.invoiceSequence).toEqual({ prefix: "GGIOHK", nextNumber: "43" });
  });

  it("embeds the current ISO currency codes and minor units", () => {
    expect(currencies).toContainEqual({ code: "JPY", minorUnit: 0, name: "Yen" });
    expect(currencies).toContainEqual({ code: "USD", minorUnit: 2, name: "US Dollar" });
    expect(currencies).toContainEqual({ code: "KWD", minorUnit: 3, name: "Kuwaiti Dinar" });
    expect(currencies).toContainEqual({ code: "CLF", minorUnit: 4, name: "Unidad de Fomento" });
    expect(currencies.some(({ code }) => code === "XAD")).toBe(true);
    expect(currencies.map(({ code }): string => code)).not.toContain("BGN");
  });
});

describe("client input parsing", () => {
  it("keeps raw client input distinct from persisted client data", () => {
    expectTypeOf<ClientInput>().not.toExtend<Client>();
    expectTypeOf<Client["invoiceSequence"]["nextNumber"]>().not.toExtend<number>();
  });

  it("rejects malformed data at the untyped boundary", () => {
    expect(validateClientInput({ ...completeClientInput, legalName: 42 }, [], null)).toMatchObject({
      kind: "invalid",
      reason: "details",
      errors: [{ fieldName: "legalName" }],
    });
    expect(() => parseClientInputFields({ ...completeClientInput, legalName: 42 })).toThrow(
      /expected string/i,
    );
    expect(validateClientInput(null, [], null)).toEqual({
      kind: "invalid",
      reason: "malformed",
      errors: [],
    });
  });
});
