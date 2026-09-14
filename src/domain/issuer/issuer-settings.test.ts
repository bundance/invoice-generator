import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  type IssuerFieldName,
  type IssuerSettings,
  type IssuerSettingsInput,
  parseIssuerSettingsInput,
  persistedIssuerSettingsSchema,
  validateIssuerSettings,
} from "./issuer-settings.ts";
import { completeIssuer, completeIssuerInput } from "../../../tests/fixtures/issuer-settings.ts";

describe("issuer settings validation", () => {
  it("normalizes document text, identifiers, payment details, VAT, and timezone", () => {
    const result = validateIssuerSettings({
      legalName: "  Code\u0301rnetic   Ltd  ",
      registeredAddress: "  7 Coley Hill\r\nReading\rBerkshire\nRG1 6AE  ",
      companyNumber: "ab12",
      vatRegistrationNumber: "gb 388 8021 60",
      bankName: "  H S B C  ",
      sortCode: "40 38-04",
      accountNumber: "5457-5059",
      standardVatRate: "020.000",
      businessTimezone: " Europe/London ",
    });

    expect(result).toEqual({
      kind: "valid",
      issuer: {
        legalName: "Codérnetic Ltd",
        registeredAddress: "7 Coley Hill\nReading\nBerkshire\nRG1 6AE",
        companyNumber: "AB12",
        vatRegistrationNumber: "388802160",
        bankName: "H S B C",
        sortCode: "403804",
        accountNumber: "54575059",
        standardVatRate: "20",
        businessTimezone: "Europe/London",
        wordmark: "codernetic",
      },
    });
  });

  it.each([
    { fieldName: "legalName", value: "", label: "legal name is required" },
    {
      fieldName: "legalName",
      value: "Codernetic\nLtd",
      label: "single-line controls are rejected",
    },
    { fieldName: "registeredAddress", value: "", label: "registered address is required" },
    {
      fieldName: "registeredAddress",
      value: "a".repeat(1_001),
      label: "registered address has a 1,000-grapheme limit",
    },
    {
      fieldName: "registeredAddress",
      value: "7 Coley Hill\tReading",
      label: "multiline controls are rejected",
    },
    {
      fieldName: "companyNumber",
      value: "GB 8822243",
      label: "company number keeps certificate form",
    },
    {
      fieldName: "companyNumber",
      value: "123456789",
      label: "company number has an eight-character limit",
    },
    {
      fieldName: "vatRegistrationNumber",
      value: "38880216",
      label: "VAT registration has nine digits",
    },
    {
      fieldName: "vatRegistrationNumber",
      value: "388\t802160",
      label: "VAT registration rejects controls",
    },
    { fieldName: "bankName", value: "", label: "bank name is required" },
    { fieldName: "sortCode", value: "40-38-0", label: "sort code has six digits" },
    { fieldName: "sortCode", value: "40\n38-04", label: "sort code rejects controls" },
    { fieldName: "accountNumber", value: "5457505", label: "account number has eight digits" },
    {
      fieldName: "accountNumber",
      value: "5457\t5059",
      label: "account number rejects controls",
    },
    { fieldName: "standardVatRate", value: "0", label: "VAT rate is positive" },
    { fieldName: "standardVatRate", value: "100.001", label: "VAT rate is no greater than 100" },
    { fieldName: "standardVatRate", value: "20.0001", label: "VAT rate has three decimal places" },
    { fieldName: "businessTimezone", value: "London", label: "timezone uses an IANA name" },
  ] satisfies ReadonlyArray<
    Readonly<{ fieldName: IssuerFieldName; value: string; label: string }>
  >)("rejects issuer settings when $label", ({ fieldName, value }) => {
    const result = validateIssuerSettings({ ...completeIssuerInput, [fieldName]: value });

    expect(result.kind).toBe("invalid");
    if (result.kind === "valid") throw new Error("Expected invalid issuer settings");
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldName, message: expect.any(String) })]),
    );
  });

  it("counts normalized graphemes instead of UTF-16 code units", () => {
    const twoHundredGraphemes = "שָ".repeat(200);
    const accepted = validateIssuerSettings({
      ...completeIssuerInput,
      legalName: twoHundredGraphemes,
    });
    const rejected = validateIssuerSettings({
      ...completeIssuerInput,
      legalName: `${twoHundredGraphemes}a`,
    });

    expect(accepted.kind).toBe("valid");
    expect(rejected).toEqual({
      kind: "invalid",
      errors: [{ fieldName: "legalName", message: "Use 200 characters or fewer." }],
    });
  });

  it("accepts IANA timezone aliases supported by the runtime", () => {
    const result = validateIssuerSettings({
      ...completeIssuerInput,
      businessTimezone: "US/Eastern",
    });

    expect(result).toEqual({
      kind: "valid",
      issuer: { ...completeIssuer, businessTimezone: "US/Eastern" },
    });
  });
});

describe("issuer settings input parsing", () => {
  it("keeps raw settings and bank identifiers distinct from canonical values", () => {
    expectTypeOf<IssuerSettingsInput>().not.toExtend<IssuerSettings>();
    expectTypeOf<IssuerSettings["sortCode"]>().not.toExtend<IssuerSettings["accountNumber"]>();
  });

  it("returns a canonical issuer without retaining the mutable input", () => {
    const input = { ...completeIssuerInput };
    const issuer = parseIssuerSettingsInput(input);

    input.legalName = "Changed after parsing";

    expect(issuer).toEqual(completeIssuer);
  });

  it("rejects invalid domain values before they reach persistence", () => {
    expect(() =>
      parseIssuerSettingsInput({ ...completeIssuerInput, standardVatRate: "0" }),
    ).toThrow("Issuer settings are invalid");
  });

  it("rejects malformed field values at the untyped boundary", () => {
    expect(() => parseIssuerSettingsInput({ ...completeIssuerInput, legalName: 42 })).toThrow(
      "Issuer settings input does not match the expected fields",
    );
  });

  it("rejects non-canonical values at the persisted-settings boundary", () => {
    expect(
      persistedIssuerSettingsSchema.safeParse({
        ...completeIssuer,
        vatRegistrationNumber: "GB 388 8021 60",
      }).success,
    ).toBe(false);
    expect(
      persistedIssuerSettingsSchema.safeParse({
        ...completeIssuer,
        businessTimezone: " US/Eastern ",
      }).success,
    ).toBe(false);
    expect(
      persistedIssuerSettingsSchema.safeParse({
        ...completeIssuer,
        businessTimezone: "US/Eastern",
      }).success,
    ).toBe(true);
  });
});
