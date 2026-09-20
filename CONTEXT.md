# Invoicing

This context describes the parties and documents involved in producing invoices for professional services.

## Language

**Issuer**:
The single company that sends invoices and receives payment.
_Avoid_: Vendor, supplier, active company

**Company number**:
The issuer's registered identifier in the significant form shown on its certificate of incorporation, such as `8822243`. Leading zeros used by a registry lookup do not change the number printed on an invoice.
_Avoid_: Company code, registration code

**VAT registration number**:
The issuer's nine-digit UK VAT identifier. A `GB` prefix may be displayed where the invoice context requires it, but it is not part of the company number.
_Avoid_: VAT number, company number

**Client**:
The person or organization that receives an invoice. A client has its own invoice prefix, currency, standard rate, and VAT treatment, which are copied into a draft rather than linked to it.
_Avoid_: Customer, account

**Invoice**:
A dated request for payment from the issuer to one client.
_Avoid_: Bill, payment request

**Invoice draft**:
The single recoverable, editable invoice in progress. It may contain incomplete input, has no invoice ID, and can be discarded without consuming an invoice number.
_Avoid_: Unissued invoice, saved invoice

**Invoice prefix**:
The unique client-specific code at the start of every invoice ID. It contains 2 to 12 uppercase ASCII letters or digits and becomes fixed when the client's first invoice is issued.
_Avoid_: Client code

**Invoice number**:
The positive consecutive value in a client's invoice sequence. Its starting value may be chosen before the first issue; it is displayed with at least four digits and never reused after issue.
_Avoid_: Sequence, counter

**Voided invoice number**:
An invoice ID retained when recovery finds that its number was consumed but no issued invoice survives. It records the gap and can never be reused.
_Avoid_: Cancelled invoice, deleted invoice

**Invoice ID**:
The unique identifier formed from an invoice prefix and invoice number, such as `GGIOHK-0043`.
_Avoid_: Invoice reference, invoice code

**Issue**:
The act that turns the invoice draft into an issued invoice and consumes the client's next invoice number. Preparation and validation do not issue an invoice.
_Avoid_: Generate, save

**Issued invoice**:
An invoice created from a fully validated snapshot and retained as an unchanging historical record. Later changes to issuer, client, rate, VAT details, currency definitions, or time-zone settings do not alter it.
_Avoid_: Generated invoice, saved invoice

**Credit note**:
An immutable document that negates one issued invoice's stored amounts in full using its original currency and tax facts, while preserving that invoice as part of the record.
_Avoid_: Void, cancellation

**Credit note ID**:
The credit note's unique identifier, formed by prefixing the original invoice ID with `CN-`, such as `CN-GGIOHK-0043`.
_Avoid_: Credit note number, correction ID

**Fully credited invoice**:
An issued invoice with a linked full credit note. The original invoice remains unchanged, but its full value has been reversed.
_Avoid_: Voided invoice, cancelled invoice

**Replacement invoice**:
A new issued invoice that corrects a fully credited invoice. It has its own invoice ID and may itself be credited and replaced later.
_Avoid_: Revised invoice, edited invoice

**Service line**:
One entry in an invoice's non-empty ordered collection of work. Each service line owns its description, inclusive period, billable days, day rate, calculated amounts, and VAT rate when the invoice is UK taxable. Net and VAT round per service line before invoice totals are summed.
_Avoid_: Line item, charge row

**Billable day**:
The unit used to measure invoiced work. Billable days are positive and measured in quarter-day increments.
_Avoid_: Quantity, unit

**Day rate**:
The positive amount a client pays for one billable day, expressed to the minor-unit precision of that client's currency.
_Avoid_: Rate, unit price

**Client currency**:
The active ISO 4217 currency used for every monetary value on a client's invoices. Its code and minor-unit precision form part of every issued invoice snapshot.
_Avoid_: Display currency, invoice currency

**Invoice period**:
The inclusive calendar-date range during which the invoiced service was completed. Its end cannot follow the invoice issue date.
_Avoid_: Billing period, service dates

**Tax point**:
The date on which a UK-taxable supply is treated as taking place for VAT. It may differ from the invoice issue date.
_Avoid_: VAT date, supply date

**Business timezone**:
The issuer's named time zone that defines the current calendar date for issuing documents. Travel and changes to the Mac's local time zone do not change it.
_Avoid_: Local timezone, system timezone

**Standard VAT rate**:
The issuer's current statutory UK VAT percentage for new UK-taxable invoices.
_Avoid_: Current VAT, client VAT rate

**VAT treatment**:
The invoice-wide tax classification selected for its supplies: UK taxable, with a positive VAT rate on every service line, or outside the scope of UK VAT, with no numeric VAT rate on any service line.
_Avoid_: VAT rate, VAT status

**Reverse charge**:
A selection available only for a supply outside the scope of UK VAT, in which the client accounts for tax in the country of receipt. An overseas client does not imply it automatically.
_Avoid_: Zero VAT, overseas VAT

**Exchange record**:
The rate current at the tax point, effective date, method, and evidence used to convert a UK-taxable foreign-currency invoice into sterling for VAT. It states how many units of the client currency equal one pound sterling.
_Avoid_: Conversion, exchange-rate field

**Outside-scope evidence reference**:
A short pointer to the business and place-of-belonging evidence that supports treating a supply as outside the scope of UK VAT. The supporting evidence may be retained outside the app.
_Avoid_: VAT note, overseas note

**Invoice layout**:
The fixed visual arrangement defined by the reference invoice. Its business content can change, but users cannot rearrange or restyle it.
_Avoid_: Template, theme
