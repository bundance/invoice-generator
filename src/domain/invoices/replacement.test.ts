import { describe, expect, it } from "vite-plus/test";

import { persistedClientSchema } from "../clients/client.js";
import { completeClient } from "../../../tests/fixtures/client.js";
import {
  completeCreditNote,
  completeIssuedInvoice,
} from "../../../tests/fixtures/issued-invoice.js";
import { createReplacementDraft } from "./replacement.js";

describe("replacement invoice", () => {
  it("copies only editable original facts into an unnumbered draft", () => {
    const currentClient = persistedClientSchema.parse({
      ...completeClient,
      currency: { code: "GBP", minorUnit: 2, name: "Pound Sterling" },
      defaultServiceDescription: "Current default service",
      invoiceSequence: { ...completeClient.invoiceSequence, nextNumber: "44" },
      paymentTerms: "Due within 14 days",
      standardDayRate: "900",
      vatTreatment: { kind: "uk-taxable", rate: "20", wording: "UK VAT applies." },
    });

    const replacement = createReplacementDraft({
      client: currentClient,
      creditNote: completeCreditNote,
      invoice: completeIssuedInvoice,
    });

    expect(replacement).toEqual({
      draft: {
        billableDays: "4",
        clientId: currentClient.id,
        clientLegalName: "Genesis Global",
        clientPostalAddress: "123 Market Street\nNew York\nNY 10001",
        currencyCode: "USD",
        dayRate: "725",
        issueDate: "",
        notes: "",
        outsideScopeEvidenceReference: "Contract and tax certificate",
        paymentTerms: "Due within 30 days",
        periodEnd: "2026-09-04",
        periodStart: "2026-09-01",
        purchaseOrder: "",
        reverseCharge: true,
        serviceDescription: "React Native consultancy\nProject delivery",
        vatTreatment: "outside-scope",
      },
      source: "GGIOHK-0043",
    });
    expect(replacement.draft).not.toHaveProperty("id");
    expect(replacement.draft).not.toHaveProperty("invoiceNumber");
    expect(replacement.draft).not.toHaveProperty("issuer");
    expect(replacement.draft).not.toHaveProperty("totals");
  });
});
