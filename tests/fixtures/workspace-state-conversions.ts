// These values are transcribed from the named release commits, with no production fixture imports.
const releasedClientV1ToV4 = {
  id: "5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc",
  legalName: "Genesis Global",
  postalAddress: "123 Market Street\nNew York\nNY 10001",
  currency: { code: "USD", minorUnit: 2, name: "US Dollar" },
  standardDayRate: "725",
  vatTreatment: {
    kind: "outside-scope",
    evidenceReference: "Contract and tax certificate",
    reverseCharge: true,
    wording: "Outside the scope of UK VAT. Subject to reverse charge in the country of receipt.",
  },
  defaultServiceDescription: "React Native consultancy\nProject delivery",
  paymentTerms: "Due within 30 days",
  invoiceSequence: { prefix: "GGIOHK", nextNumber: "44" },
  creditNoteSequence: { prefix: "CNGGIOHK", nextNumber: "44" },
} as const;

const releasedClientV5 = {
  id: "5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc",
  legalName: "Genesis Global",
  postalAddress: "123 Market Street\nNew York\nNY 10001",
  currency: { code: "USD", minorUnit: 2, name: "US Dollar" },
  standardDayRate: "725",
  vatTreatment: {
    kind: "outside-scope",
    evidenceReference: "Contract and tax certificate",
    reverseCharge: true,
    wording: "Outside the scope of UK VAT. Subject to reverse charge in the country of receipt.",
  },
  defaultServiceDescription: "React Native consultancy\nProject delivery",
  paymentTerms: "Due within 30 days",
  invoiceSequence: { prefix: "GGIOHK", nextNumber: "44" },
} as const;

const releasedGbpVatClientV1ToV4 = {
  id: "647253f4-113c-4d84-8381-c219776b7469",
  legalName: "Acme Research Ltd",
  postalAddress: "9 High Street\nReading\nRG1 1AA",
  currency: { code: "GBP", minorUnit: 2, name: "Pound Sterling" },
  standardDayRate: "725",
  vatTreatment: { kind: "uk-taxable", rate: "20", wording: "UK VAT applies." },
  defaultServiceDescription: "Consultancy",
  paymentTerms: "Due within 30 days",
  invoiceSequence: { prefix: "ACME", nextNumber: "8" },
  creditNoteSequence: { prefix: "CNACME", nextNumber: "8" },
} as const;

const releasedGbpVatClientV5 = {
  id: "647253f4-113c-4d84-8381-c219776b7469",
  legalName: "Acme Research Ltd",
  postalAddress: "9 High Street\nReading\nRG1 1AA",
  currency: { code: "GBP", minorUnit: 2, name: "Pound Sterling" },
  standardDayRate: "725",
  vatTreatment: { kind: "uk-taxable", rate: "20", wording: "UK VAT applies." },
  defaultServiceDescription: "Consultancy",
  paymentTerms: "Due within 30 days",
  invoiceSequence: { prefix: "ACME", nextNumber: "8" },
} as const;

const outsideScopeExpectedV6 = {
  schemaVersion: 6,
  issuer: null,
  clients: [releasedClientV5],
  draft: {
    kind: "ordinary",
    draft: {
      clientId: "5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc",
      clientLegalName: "Genesis Global",
      clientPostalAddress: "123 Market Street\nNew York\nNY 10001",
      currencyCode: "USD",
      serviceDescription: "Consultancy",
      periodStart: "",
      periodEnd: "",
      issueDate: "",
      billableDays: "",
      dayRate: "725",
      paymentTerms: "Due within 30 days",
      notes: "",
      purchaseOrder: "",
      vatTreatment: "outside-scope",
      outsideScopeEvidenceReference: "Contract and tax certificate",
      reverseCharge: true,
    },
  },
  issuedInvoices: [],
  creditNotes: [],
  voidedInvoiceNumbers: [],
} as const;

const ukTaxableExpectedV6 = {
  schemaVersion: 6,
  issuer: null,
  clients: [releasedGbpVatClientV5],
  draft: {
    kind: "ordinary",
    draft: {
      clientId: "647253f4-113c-4d84-8381-c219776b7469",
      clientLegalName: "Acme Research Ltd",
      clientPostalAddress: "9 High Street\nReading\nRG1 1AA",
      currencyCode: "GBP",
      serviceDescription: "Consultancy",
      periodStart: "2026-09-02",
      periodEnd: "2026-09-05",
      issueDate: "2026-09-06",
      billableDays: "4",
      dayRate: "725",
      paymentTerms: "Due within 30 days",
      notes: "",
      purchaseOrder: "",
      vatTreatment: "uk-taxable",
      vatRate: "20",
      taxPoint: "2026-09-05",
      exchange: { kind: "not-required" },
    },
  },
  issuedInvoices: [],
  creditNotes: [],
  voidedInvoiceNumbers: [],
} as const;

export const supportedWorkspaceStateConversions = [
  {
    expectedV6: outsideScopeExpectedV6,
    inputJson: `{"schemaVersion":1,"issuer":null,"clients":[${JSON.stringify(releasedClientV1ToV4)}],"invoiceDraft":{"clientId":"5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc","clientLegalName":"Genesis Global","clientPostalAddress":"123 Market Street\\nNew York\\nNY 10001","currencyCode":"USD","serviceDescription":"Consultancy","periodStart":"","periodEnd":"","issueDate":"","billableDays":"","dayRate":"725","paymentTerms":"Due within 30 days","notes":"","purchaseOrder":"","outsideScopeEvidenceReference":"Contract and tax certificate","reverseCharge":true},"issuedInvoices":[],"creditNotes":[],"voidedInvoiceNumbers":[],"replacementLinks":[]}`,
    schemaVersion: 1,
    sourceCommit: "eff8c67",
  },
  {
    expectedV6: ukTaxableExpectedV6,
    inputJson: `{"schemaVersion":1,"issuer":null,"clients":[${JSON.stringify(releasedGbpVatClientV1ToV4)}],"invoiceDraft":{"clientId":"647253f4-113c-4d84-8381-c219776b7469","clientLegalName":"Acme Research Ltd","clientPostalAddress":"9 High Street\\nReading\\nRG1 1AA","currencyCode":"GBP","serviceDescription":"Consultancy","periodStart":"2026-09-02","periodEnd":"2026-09-05","issueDate":"2026-09-06","billableDays":"4","dayRate":"725","paymentTerms":"Due within 30 days","notes":"","purchaseOrder":"","vatTreatment":"uk-taxable","vatRate":"20","taxPoint":"2026-09-05","outsideScopeEvidenceReference":"","reverseCharge":false},"issuedInvoices":[],"creditNotes":[],"voidedInvoiceNumbers":[],"replacementLinks":[]}`,
    schemaVersion: 1,
    sourceCommit: "eff8c67",
  },
  {
    expectedV6: ukTaxableExpectedV6,
    inputJson: `{"schemaVersion":2,"issuer":null,"clients":[${JSON.stringify(releasedGbpVatClientV1ToV4)}],"invoiceDraft":{"clientId":"647253f4-113c-4d84-8381-c219776b7469","clientLegalName":"Acme Research Ltd","clientPostalAddress":"9 High Street\\nReading\\nRG1 1AA","currencyCode":"GBP","serviceDescription":"Consultancy","periodStart":"2026-09-02","periodEnd":"2026-09-05","issueDate":"2026-09-06","billableDays":"4","dayRate":"725","paymentTerms":"Due within 30 days","notes":"","purchaseOrder":"","vatTreatment":"uk-taxable","vatRate":"20","taxPoint":"2026-09-05"},"issuedInvoices":[],"creditNotes":[],"voidedInvoiceNumbers":[],"replacementLinks":[]}`,
    schemaVersion: 2,
    sourceCommit: "36f8cf0",
  },
  {
    expectedV6: outsideScopeExpectedV6,
    inputJson: `{"schemaVersion":3,"issuer":null,"clients":[${JSON.stringify(releasedClientV1ToV4)}],"invoiceDraft":{"clientId":"5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc","clientLegalName":"Genesis Global","clientPostalAddress":"123 Market Street\\nNew York\\nNY 10001","currencyCode":"USD","serviceDescription":"Consultancy","periodStart":"","periodEnd":"","issueDate":"","billableDays":"","dayRate":"725","paymentTerms":"Due within 30 days","notes":"","purchaseOrder":"","vatTreatment":"outside-scope","outsideScopeEvidenceReference":"Contract and tax certificate","reverseCharge":true},"issuedInvoices":[],"creditNotes":[],"voidedInvoiceNumbers":[],"replacementLinks":[]}`,
    schemaVersion: 3,
    sourceCommit: "eb582a2",
  },
  {
    expectedV6: outsideScopeExpectedV6,
    inputJson: `{"schemaVersion":4,"issuer":null,"clients":[${JSON.stringify(releasedClientV1ToV4)}],"invoiceDraft":{"clientId":"5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc","clientLegalName":"Genesis Global","clientPostalAddress":"123 Market Street\\nNew York\\nNY 10001","currencyCode":"USD","serviceDescription":"Consultancy","periodStart":"","periodEnd":"","issueDate":"","billableDays":"","dayRate":"725","paymentTerms":"Due within 30 days","notes":"","purchaseOrder":"","vatTreatment":"outside-scope","outsideScopeEvidenceReference":"Contract and tax certificate","reverseCharge":true},"issuedInvoices":[],"creditNotes":[],"voidedInvoiceNumbers":[],"replacementLinks":[]}`,
    schemaVersion: 4,
    sourceCommit: "de22519",
  },
  {
    expectedV6: outsideScopeExpectedV6,
    inputJson: `{"schemaVersion":5,"issuer":null,"clients":[${JSON.stringify(releasedClientV5)}],"invoiceDraft":{"clientId":"5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc","clientLegalName":"Genesis Global","clientPostalAddress":"123 Market Street\\nNew York\\nNY 10001","currencyCode":"USD","serviceDescription":"Consultancy","periodStart":"","periodEnd":"","issueDate":"","billableDays":"","dayRate":"725","paymentTerms":"Due within 30 days","notes":"","purchaseOrder":"","vatTreatment":"outside-scope","outsideScopeEvidenceReference":"Contract and tax certificate","reverseCharge":true},"issuedInvoices":[],"creditNotes":[],"voidedInvoiceNumbers":[],"replacementLinks":[]}`,
    schemaVersion: 5,
    sourceCommit: "2a50cc3",
  },
] as const;

const releasedIssuer = {
  legalName: "Codernetic Ltd",
  registeredAddress: "7 Coley Hill\nReading\nBerkshire\nRG1 6AE",
  companyNumber: "8822243",
  vatRegistrationNumber: "388802160",
  bankName: "HSBC",
  sortCode: "403804",
  accountNumber: "54575059",
  standardVatRate: "20",
  businessTimezone: "Europe/London",
  wordmark: "codernetic",
} as const;

const releasedDraftV1 = {
  clientId: "5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc",
  clientLegalName: "Genesis Global",
  clientPostalAddress: "123 Market Street\nNew York\nNY 10001",
  currencyCode: "USD",
  serviceDescription: "React Native consultancy\nProject delivery",
  periodStart: "",
  periodEnd: "",
  issueDate: "",
  billableDays: "",
  dayRate: "725",
  paymentTerms: "Due within 30 days",
  notes: "",
  purchaseOrder: "",
  outsideScopeEvidenceReference: "Contract and tax certificate",
  reverseCharge: true,
} as const;

const releasedDraftV2ToV5 = {
  clientId: "5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc",
  clientLegalName: "Genesis Global",
  clientPostalAddress: "123 Market Street\nNew York\nNY 10001",
  currencyCode: "USD",
  serviceDescription: "React Native consultancy\nProject delivery",
  periodStart: "",
  periodEnd: "",
  issueDate: "",
  billableDays: "",
  dayRate: "725",
  paymentTerms: "Due within 30 days",
  notes: "",
  purchaseOrder: "",
  vatTreatment: "outside-scope",
  outsideScopeEvidenceReference: "Contract and tax certificate",
  reverseCharge: true,
} as const;

const releasedInvoiceCommon = {
  id: "GGIOHK-0043",
  invoiceNumber: "43",
  client: {
    id: "5c332f1f-665b-4ce7-9dc3-3df0f91dc8bc",
    legalName: "Genesis Global",
    postalAddress: "123 Market Street\nNew York\nNY 10001",
  },
  currency: { code: "USD", minorUnit: 2, name: "US Dollar" },
  serviceDescription: "React Native consultancy\nProject delivery",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-04",
  billableDays: "4",
  dayRate: "725",
  paymentTerms: "Due within 30 days",
  notes: "",
  purchaseOrder: "",
  issuer: releasedIssuer,
  totals: { net: "2900.00", vat: "0.00", gross: "2900.00" },
  issue: {
    date: "2026-09-04",
    timestamp: "2026-09-04T10:11:12.000Z",
    businessTimezone: "Europe/London",
    lateIssueDateAcknowledged: false,
  },
  retainedPdf: {
    filename: "GGIOHK-0043.pdf",
    sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
} as const;

const outsideScopeVatTreatment = {
  evidenceReference: "Contract and tax certificate",
  kind: "outside-scope",
  reverseCharge: true,
  wording: "Outside the scope of UK VAT. Subject to reverse charge in the country of receipt.",
} as const;

const releasedInvoiceV1ToV2 = {
  ...releasedInvoiceCommon,
  vatTreatment: outsideScopeVatTreatment,
} as const;

const releasedInvoiceV3ToV5 = {
  ...releasedInvoiceCommon,
  taxFacts: { kind: "outside-scope", vatTreatment: outsideScopeVatTreatment },
} as const;

const releasedCreditNoteV4ToV5 = {
  client: releasedInvoiceCommon.client,
  currency: releasedInvoiceCommon.currency,
  serviceDescription: releasedInvoiceCommon.serviceDescription,
  periodStart: releasedInvoiceCommon.periodStart,
  periodEnd: releasedInvoiceCommon.periodEnd,
  dayRate: releasedInvoiceCommon.dayRate,
  paymentTerms: releasedInvoiceCommon.paymentTerms,
  notes: releasedInvoiceCommon.notes,
  purchaseOrder: releasedInvoiceCommon.purchaseOrder,
  issuer: releasedIssuer,
  billableDays: "-4",
  id: "CN-GGIOHK-0043",
  originalInvoiceId: "GGIOHK-0043",
  originalIssueDate: "2026-09-04",
  reason: "The billed service period was incorrect.",
  taxFacts: { kind: "outside-scope", vatTreatment: outsideScopeVatTreatment },
  totals: { gross: "-2900.00", net: "-2900.00", vat: "0.00" },
  issue: {
    businessTimezone: "Europe/London",
    date: "2026-09-07",
    timestamp: "2026-09-07T10:11:12.000Z",
  },
  retainedPdf: {
    filename: "CN-GGIOHK-0043.pdf",
    sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  },
} as const;

const expectedFullClientV6 = releasedClientV5;
const expectedFullDraftV6 = { kind: "ordinary", draft: releasedDraftV2ToV5 } as const;
const expectedFullInvoiceV6 = { ...releasedInvoiceV3ToV5, replacesInvoiceId: null } as const;
const expectedFullCreditNoteV6 = {
  ...releasedCreditNoteV4ToV5,
  replacesInvoiceId: null,
} as const;
const expectedFullWorkspaceWithoutCreditNoteV6 = {
  schemaVersion: 6,
  issuer: releasedIssuer,
  clients: [expectedFullClientV6],
  draft: expectedFullDraftV6,
  issuedInvoices: [expectedFullInvoiceV6],
  creditNotes: [],
  voidedInvoiceNumbers: [],
} as const;
const expectedFullWorkspaceWithCreditNoteV6 = {
  ...expectedFullWorkspaceWithoutCreditNoteV6,
  creditNotes: [expectedFullCreditNoteV6],
} as const;

export const fullWorkspaceStateConversions = [
  {
    expectedV6: expectedFullWorkspaceWithoutCreditNoteV6,
    inputJson: JSON.stringify({
      schemaVersion: 1,
      issuer: releasedIssuer,
      clients: [releasedClientV1ToV4],
      invoiceDraft: releasedDraftV1,
      issuedInvoices: [releasedInvoiceV1ToV2],
      creditNotes: [],
      voidedInvoiceNumbers: [],
      replacementLinks: [],
    }),
    schemaVersion: 1,
    sourceCommit: "eff8c67",
  },
  {
    expectedV6: expectedFullWorkspaceWithoutCreditNoteV6,
    inputJson: JSON.stringify({
      schemaVersion: 2,
      issuer: releasedIssuer,
      clients: [releasedClientV1ToV4],
      invoiceDraft: releasedDraftV2ToV5,
      issuedInvoices: [releasedInvoiceV1ToV2],
      creditNotes: [],
      voidedInvoiceNumbers: [],
      replacementLinks: [],
    }),
    schemaVersion: 2,
    sourceCommit: "36f8cf0",
  },
  {
    expectedV6: expectedFullWorkspaceWithoutCreditNoteV6,
    inputJson: JSON.stringify({
      schemaVersion: 3,
      issuer: releasedIssuer,
      clients: [releasedClientV1ToV4],
      invoiceDraft: releasedDraftV2ToV5,
      issuedInvoices: [releasedInvoiceV3ToV5],
      creditNotes: [],
      voidedInvoiceNumbers: [],
      replacementLinks: [],
    }),
    schemaVersion: 3,
    sourceCommit: "eb582a2",
  },
  {
    expectedV6: expectedFullWorkspaceWithCreditNoteV6,
    inputJson: JSON.stringify({
      schemaVersion: 4,
      issuer: releasedIssuer,
      clients: [releasedClientV1ToV4],
      invoiceDraft: releasedDraftV2ToV5,
      issuedInvoices: [releasedInvoiceV3ToV5],
      creditNotes: [releasedCreditNoteV4ToV5],
      voidedInvoiceNumbers: [],
      replacementLinks: [],
    }),
    schemaVersion: 4,
    sourceCommit: "de22519",
  },
  {
    expectedV6: expectedFullWorkspaceWithCreditNoteV6,
    inputJson: JSON.stringify({
      schemaVersion: 5,
      issuer: releasedIssuer,
      clients: [releasedClientV5],
      invoiceDraft: releasedDraftV2ToV5,
      issuedInvoices: [releasedInvoiceV3ToV5],
      creditNotes: [releasedCreditNoteV4ToV5],
      voidedInvoiceNumbers: [],
      replacementLinks: [],
    }),
    schemaVersion: 5,
    sourceCommit: "2a50cc3",
  },
] as const;
