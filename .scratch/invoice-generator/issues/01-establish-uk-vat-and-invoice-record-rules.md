# Establish UK VAT and invoice-record rules

Type: research
Status: resolved
Blocked by: none

## Question

Which current HMRC rules constrain VAT treatment for overseas consultancy, invoice numbering, foreign currencies, record retention, and corrections?

## Answer

The cited research is recorded in [`docs/research/uk-vat-invoice-requirements.md`](../../../docs/research/uk-vat-invoice-requirements.md).

- Treat ordinary overseas business consultancy as outside the scope of UK VAT when the place-of-supply rule applies, not as UK VAT charged at 0%.
- Select reverse-charge wording explicitly rather than inferring it from an overseas client.
- Keep client-specific sequential invoice series, never reuse issued numbers, and retain voided-number records.
- When UK VAT is due on a foreign-currency invoice, show the required sterling VAT summary and retain the exchange-rate evidence.
- Keep issued invoices immutable and non-deletable, with linked correction records where corrections are supported.
- Provide backup and restore if local app data is the authoritative invoice record.
