# UK VAT and invoice requirements for the invoice generator

Research checked on 2 September 2026. This is a product-planning summary of current HMRC guidance, not tax or legal advice. It assumes the issuer is a UK VAT-registered business supplying ordinary consultancy services; special place-of-supply rules can produce a different result.

## 1. Overseas business customers

For an ordinary business-to-business consultancy service, the place of supply is where the customer belongs. If the customer belongs outside the UK, the supply is outside the scope of UK VAT and the UK supplier must not charge UK VAT. The supplier must retain commercial evidence that the customer is in business and belongs outside the UK. A VAT number is HMRC's preferred evidence for an EU business, but HMRC permits other fiscal certificates or commercial documents where no VAT number is available. ([HMRC VAT Notice 741A, sections 2.1, 2.2 and 6.3](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a))

This treatment is **outside the scope of UK VAT**, not a UK **zero-rated** supply. The app should model it as a VAT treatment, rather than saving `0%` as though that were the applicable UK VAT rate. For the fixed-layout PDF, the clearest display is:

- VAT treatment/rate: `Outside the scope of UK VAT`
- UK VAT charged: `0.00` in the invoice currency
- total: equal to the net amount

Those display labels are a product recommendation derived from HMRC's classification; they are not prescribed wording. They prevent a no-UK-VAT supply from being misrepresented as a taxable UK supply charged at the zero rate. ([HMRC VAT Notice 741A, sections 1.4 and 2.1](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a))

Where the destination country's rules make the business customer liable for local tax, the invoice must indicate the reverse-charge treatment. HMRC accepts wording such as `Subject to reverse charge in the country of receipt`. The app must not infer this merely from the customer being overseas: reverse-charge applicability depends on the destination country's rules and the particular supply. Model it as an explicit client or invoice treatment. A suitable combined note is `Outside the scope of UK VAT. Subject to reverse charge in the country of receipt.` ([HMRC VAT Traders' Records Manual, VATREC5010](https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec5010))

The general rule has exceptions, including services directly related to land and certain use-and-enjoyment cases. The app should therefore describe its overseas treatment as user-selected tax treatment rather than offer tax advice based only on country. ([HMRC VAT Notice 741A, sections 6.4, 7 and 13](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a))

### Product implication

An invoice needs an immutable snapshot of:

- the selected VAT treatment (`UK taxable` or `outside scope of UK VAT`)
- the statutory UK VAT rate used for a taxable supply
- whether destination-country reverse-charge wording applies
- the exact VAT wording printed
- the evidence reference supporting an overseas customer's business status and place of belonging, even if that evidence itself is kept outside this app

## 2. Invoice-number sequences

A VAT invoice needs a sequential number, from one or more series, which uniquely identifies it. The identifier may combine letters and numbers, may start at a number other than 1, and multiple sequences may run concurrently. HMRC explicitly says that separate concurrent sequences for several customers are acceptable. ([HMRC VAT Traders' Records Manual, VATREC5010](https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec5010))

The proposed `<CLIENT-PREFIX>-<CONSECUTIVE-NUMBER>` design is therefore compatible with HMRC's published guidance, provided that:

- every complete identifier is unique
- each client series increases consecutively
- a prefix cannot be changed in a way that creates ambiguity or duplicates
- an issued number is never reused

A break is acceptable when an invoice is cancelled, spoiled or never issued, but the cancelled/spoiled record must be retained or the business must be able to explain the gap. The app should record a failed or voided issuance rather than silently reusing a number that has already been reserved or exposed. ([HMRC VAT Traders' Records Manual, VATREC5010](https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec5010))

## 3. Foreign-currency invoices

Invoices may be issued in any currency. If UK VAT is due, the invoice must additionally show in sterling:

- the total net value at each VAT rate
- the VAT amount at each VAT rate

Sterling values are not required for every individual line. HMRC's fuller VAT-invoice guidance also states that the total VAT chargeable must be expressed in sterling. ([HMRC guidance on foreign-currency transactions](https://www.gov.uk/guidance/foreign-currency-transactions-vat-and-tour-operators), [HMRC VAT Notice 700, sections 16.3 and 16.4](https://www.gov.uk/guidance/vat-guide-notice-700))

For an overseas service that is outside the scope of UK VAT, no UK VAT is due, so HMRC's sterling-on-the-invoice requirement above is not triggered. The invoice can show its commercial amounts in the client's currency without an additional sterling VAT total. This conclusion follows from HMRC limiting that requirement to transactions where UK VAT is due. Separate accounting and tax records may still require sterling values.

For a UK-taxable foreign-currency invoice, the app must snapshot the exchange rate, its effective date and conversion method with the issued invoice so the sterling values remain reproducible. HMRC permits either the UK market selling rate at the time of supply or HMRC's published period rate, subject to rules around agreed alternatives. ([HMRC guidance on foreign-currency transactions](https://www.gov.uk/guidance/foreign-currency-transactions-vat-and-tour-operators))

## 4. Retention, deletion and corrections

VAT-registered businesses generally have to keep business records for at least 6 years. The records expressly include copies of sales invoices and issued or received credit and debit notes. A copy of every VAT invoice issued must be kept. ([HMRC VAT Notice 700/21, sections 2.3, 2.4 and 3.2](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021))

For an electronic invoice, HMRC requires authenticity of origin, integrity of data and legibility. This supports treating an issued invoice as an immutable historical snapshot rather than silently editing the stored record or regenerating it from current client/company settings. ([HMRC VAT Notice 700, section 17.7](https://www.gov.uk/guidance/vat-guide-notice-700))

The resulting app policy should be:

- do not edit or hard-delete an issued invoice during the retention period
- preserve the exact issued data and PDF, including historical company details, VAT treatment, VAT rate and currency conversion
- allow an exact duplicate/re-export to be produced from that snapshot
- retain cancelled/voided invoice numbers and the reason for the cancellation
- record corrections as linked documents and keep the original

The no-edit/no-delete policy is a conservative implementation inference from HMRC's retention and integrity requirements, rather than a quoted statement that invoice software must expose no edit button.

If an issued VAT invoice shows too much VAT, the supplier must account for that higher amount unless it corrects the customer-facing error with a credit note. If it shows too little VAT, the supplier must account for the correct amount and may issue a supplementary invoice. HMRC's credit-note rules require the correction to identify the original invoice and retain the original tax treatment; the VAT rate used on a credit or debit note is the rate that applied at the original supply's tax point. ([HMRC VAT Notice 700/45, section 3.2](https://www.gov.uk/guidance/how-to-correct-vat-errors-and-make-adjustments-or-claims-vat-notice-70045), [HMRC VAT Notice 700, section 18.2](https://www.gov.uk/guidance/vat-guide-notice-700))

Before a VAT return is submitted, an error in the underlying business records may be amended, but HMRC requires a clear note explaining the error. Once an invoice has been issued, preserving the issued artifact and recording a linked correction provides the clearer audit trail. If a return has already been submitted, HMRC's formal VAT error-correction process may also apply. ([HMRC VAT Notice 700/45, sections 2 and 4](https://www.gov.uk/guidance/how-to-correct-vat-errors-and-make-adjustments-or-claims-vat-notice-70045))

### Product implication

Local-only storage does not itself guarantee six-year retention: uninstalling the app, disk failure or replacing a computer can destroy it. The implementation plan needs an explicit backup/export-and-restore mechanism, or a clearly documented external backup responsibility, before local invoice history can be treated as the sole record copy.

## Decisions this research supports

1. Keep `VAT treatment` separate from the numeric statutory VAT rate.
2. Do not represent an outside-scope service as `VAT 0%`.
3. Make reverse-charge wording an explicit selection, defaulted per client but confirmed on each invoice.
4. Keep the client-prefixed per-client invoice sequences; preserve gaps and void records.
5. Require sterling VAT summaries and a snapshotted exchange rate only when UK VAT is due on a foreign-currency invoice.
6. Make issued invoices immutable and non-deletable; correct them through retained, linked adjustment documents.
7. Include backup/export-and-restore in scope if the app is to be the authoritative six-year record store.
