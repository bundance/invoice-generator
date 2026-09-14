import {
  type IssuerSettingsInput,
  parseIssuerSettingsInput,
} from "../../src/domain/issuer/issuer-settings.js";

export const completeIssuerInput = {
  legalName: "  Codernetic   Ltd  ",
  registeredAddress: "7 Coley Hill\nReading\nBerkshire\nRG1 6AE",
  companyNumber: "8822243",
  vatRegistrationNumber: "GB 388 8021 60",
  bankName: "HSBC",
  sortCode: "40-38-04",
  accountNumber: "5457 5059",
  standardVatRate: "20.000",
  businessTimezone: "Europe/London",
} satisfies IssuerSettingsInput;

export const completeIssuer = parseIssuerSettingsInput(completeIssuerInput);
