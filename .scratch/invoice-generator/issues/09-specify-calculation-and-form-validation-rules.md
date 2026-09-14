# Specify calculation and form-validation rules

Type: grilling
Status: resolved
Blocked by: none

## Question

What precision, rounding, date-range, text-length, prefix, quantity, currency, exchange-rate, and VAT invariants must the form and issued snapshot enforce?

## Comments

### Decision round 1

- Support every active currency in an embedded ISO 4217 list. Store its code and minor-unit precision in each issued snapshot, display the code where a symbol could be ambiguous, and use base-10 decimal arithmetic.
- Require a positive day rate with no more fractional digits than the client currency permits.
- Require positive billable days in quarter-day increments. The quantity cannot exceed the inclusive number of calendar days in the invoice period.
- Support completed services only. Require `periodStart <= periodEnd <= issueDate <= today`.
- For a UK-taxable invoice, require a tax point between the period end and issue date, default it to the issue date, and warn rather than block when issue occurs more than 14 days after completion.
- Normalize whitespace and reject control characters. Apply defensive limits of 200 graphemes to single-line fields and 1,000 graphemes to multiline fields, but treat measured renderer fit as the issue-time authority and block clipping or overflow.
- Normalize invoice prefixes to uppercase and require `^[A-Z0-9]{2,12}$`. Reserve the hyphen as the separator, require case-insensitive uniqueness, lock the prefix after first issue, and pad invoice numbers to at least four digits without imposing a four-digit maximum.
- Model VAT as either UK taxable with a positive percentage and no reverse charge, or outside the scope of UK VAT with no numeric rate, zero UK VAT, and optional reverse-charge wording. Prefill the UK rate from issuer settings, permit an explicit draft override, and snapshot the rate and generated wording at issue.

### Decision round 2

- Calculate with exact base-10 decimals. Round service net to the client currency's minor unit using half-up rounding, calculate VAT from that rounded net and round it the same way, then add rounded net and VAT exactly to produce gross. Outside-scope VAT is exactly zero.
- Require an exchange record only for a UK-taxable invoice whose client currency is not GBP. Express its positive rate as `1 GBP = X <client currency>` with at most 12 significant digits, and require its effective date, method, and evidence reference. Supported methods are HMRC period rate, UK market selling rate, and another HMRC-approved method. Do not fetch rates automatically.
- Require a UK VAT rate greater than zero and no greater than 100, with at most three decimal places. Reject rather than clamp invalid rates and display them without unnecessary trailing zeros.
- Block issue unless every fixed-document fact is present and valid: issuer legal name, registered address, VAT and company numbers, bank details, client legal name and postal address, service description, invoice period, billable days, day rate, currency, issue date, prefix, and proposed invoice number. Apply the previously agreed conditional VAT, exchange, and outside-scope evidence requirements, and block renderer overflow.
- Autosave raw draft input even while it is incomplete or malformed. Show field errors after blur or the first issue attempt and update visible errors during editing. Do not show invalid numeric input as zero in the preview.
- Build the issue confirmation from a fully parsed and validated candidate snapshot. Revalidate and recalculate immediately before the durable issue commit.
- Add an issuer IANA business timezone, defaulted to `Europe/London`. Use it for calendar-date boundaries, and store it with the calendar dates and UTC issue timestamp in every issued snapshot.
- Let a new client's sequence start at any positive integer, defaulting to 1. Lock the starting value after first issue, advance by exactly one after each durable issue or retained void, and require complete invoice ID uniqueness across the dataset.

### Decision round 3

- For a UK-taxable foreign-currency invoice, calculate a separate statutory sterling summary. Divide the rounded client-currency net by the recorded rate and round half-up to GBP pennies, calculate sterling VAT from that rounded sterling net and round half-up to pennies, then add those values exactly for sterling gross. Store and show both currency calculations even if reconversion differs by one minor unit.
- Require the exchange rate to apply at the tax point.
- A full credit note negates the original invoice's stored client-currency and sterling net, VAT, and gross amounts exactly. It copies the original currency precision, VAT rate, tax point, exchange record, and wording without recalculation.
- Require a credit-note issue date on or after the original issue date and no later than the current date. Require a non-empty correction reason that satisfies the multiline text and renderer-fit rules.
- Normalize issued text to Unicode NFC and line endings to LF, trim outer whitespace, collapse whitespace in single-line fields, and preserve meaningful line breaks in multiline fields. Count grapheme limits after normalization, reject disallowed control characters, and do not alter capitalization or punctuation except for prefixes and structured identifiers.
- Keep an existing draft unchanged when its client's defaults change. Reselecting a client may replace copied draft facts only after confirmation when the user has edited them. At issue, re-read only the client's locked prefix and next invoice number.
- Treat an issue date more than 14 days after the service period as the only non-blocking validation warning. Repeat it in the issue confirmation, require acknowledgement that the tax point was checked, and store that acknowledgement in the issued snapshot without inventing or validating an HMRC exception.
- Company-number validation was left open at the end of the round. The incorporation certificate establishes `8822243`, while the current Companies House register uses the zero-padded lookup form `08822243`; the earlier recommendation incorrectly called the certificate form invalid.
- Preserve the company number in the significant form printed on its certificate of incorporation. For Codernetic, store and print `8822243`; do not add Companies House lookup padding or a `GB` prefix. Accept 1 to 8 uppercase letters or digits, and left-pad only at the boundary of a future registry lookup.
- Accept a VAT registration number with an optional `GB` prefix and spaces, then store its canonical nine digits. Add the prefix for display only where the invoice context requires it.
- Accept common bank-detail separators, then require a six-digit sort code and eight-digit account number. Identifier checks prove syntax only, not registration or account ownership.

## Answer

### Draft and issue boundary

The recoverable draft may contain incomplete or malformed raw input. Autosave it without pretending that it is an invoice snapshot. Show a field error after the field loses focus or after the first issue attempt, then update visible errors while the user edits. An invalid number must make its preview value unavailable rather than appear as zero.

Issue requires a new candidate snapshot built from normalized, parsed, and fully validated values. Build the confirmation from that candidate, then repeat normalization, parsing, validation, calculation, and renderer-fit checks immediately before the durable commit. Only that final validated snapshot may become an issued invoice.

### Required facts and text

Issue requires valid issuer legal name, registered address, VAT registration number, company number, bank details, client legal name and postal address, service description, period, billable days, day rate, currency, issue date, invoice prefix, and proposed invoice number. The VAT treatment adds the conditional facts defined below.

Normalize issued text to Unicode NFC and line endings to LF. Trim outer whitespace and collapse whitespace in single-line fields. Preserve meaningful line breaks in addresses, service descriptions, correction reasons, and evidence references. Reject disallowed control characters. Do not alter capitalization or punctuation except when normalizing prefixes and structured identifiers.

After normalization, allow at most 200 graphemes in a single-line field and 1,000 in a multiline field. Those are defensive storage limits, not proof that text fits. The shared preview and PDF renderer must measure the actual fixed-layout regions, and any clipping or overflow blocks issue.

### Identifiers and sequences

Normalize invoice prefixes to uppercase. Require 2 to 12 ASCII letters or digits using `^[A-Z0-9]{2,12}$`; reserve the hyphen as the prefix-number separator and require case-insensitive prefix uniqueness across clients. Lock a prefix after that client's first issue.

A new client's starting invoice number defaults to 1 but may be set to any positive integer before first issue. Display numbers with at least four digits but allow them to grow beyond four. Every durable issue or retained void advances the client sequence by exactly one. Never reuse a consumed number, and require every complete invoice ID to be unique across the dataset.

Preserve the company number in the significant form shown on the certificate of incorporation. For Codernetic, store and print `8822243`. Accept 1 to 8 uppercase letters or digits. Do not add Companies House lookup padding or a `GB` prefix; a future registry integration may left-pad only at its external lookup boundary.

Accept a UK VAT registration number with an optional `GB` prefix and spaces, then store its canonical nine digits. Add `GB` for display only where the invoice context requires it. Accept common bank-detail separators, then require a six-digit sort code and eight-digit account number. These checks validate syntax, not registration or account ownership.

### Dates and quantity

Use the issuer's configured IANA business timezone, defaulted to `Europe/London`, to determine the current calendar date. Store the timezone, calendar dates, and UTC issue timestamp in every issued snapshot.

The product supports completed services only. Require real calendar dates satisfying `periodStart <= periodEnd <= issueDate <= today`. Billable days must be positive quarter-day increments and cannot exceed the inclusive number of calendar days in the invoice period.

For a UK-taxable invoice, require a tax point between the period end and issue date, defaulted to the issue date. An issue date more than 14 days after the period end is the only non-blocking validation warning. Repeat it in the confirmation, require acknowledgement that the user checked the tax point, and store the acknowledgement without claiming that the app validated an HMRC exception.

### Currency and client-currency totals

Accept every active currency in an embedded ISO 4217 list. A client has one currency, and every monetary value on its invoice uses that currency. Store the code and minor-unit precision in the issued snapshot so later ISO changes cannot alter history. Show the currency code anywhere a symbol could be ambiguous.

Require a positive day rate with no more fractional digits than the client currency permits. Use exact base-10 decimal arithmetic, never binary floating point:

1. Multiply billable days by day rate and round half-up to the client currency's minor unit to produce net.
2. For UK-taxable invoices, multiply that rounded net by the VAT rate and round half-up to the same minor unit. For outside-scope invoices, VAT is exactly zero.
3. Add rounded net and VAT exactly to produce gross. Do not round gross separately.
4. Display each amount with the currency's required number of fractional digits.

### VAT treatment and sterling conversion

VAT treatment has two valid forms:

- UK taxable requires a VAT rate greater than zero and no greater than 100, with at most three decimal places. It forbids reverse charge.
- Outside the scope of UK VAT has no numeric VAT rate, produces zero UK VAT, requires a short evidence or rationale reference, and may add explicit reverse-charge wording.

Prefill the UK rate from issuer settings but allow an explicit draft override. Reject invalid rates rather than clamping them. Display the shortest exact percentage without unnecessary trailing zeros. Snapshot the treatment, rate where present, generated wording, and outside-scope evidence reference at issue.

A UK-taxable invoice in a currency other than GBP requires an exchange record. Express the positive rate as `1 GBP = X <client currency>` with at most 12 significant digits. Require a rate current at the tax point, effective date, method, and evidence reference. The method is HMRC period rate, UK market selling rate, or another HMRC-approved method. The app does not fetch rates.

Calculate a separate statutory sterling summary:

1. Divide rounded client-currency net by the recorded rate and round half-up to GBP pennies.
2. Multiply that rounded sterling net by the VAT rate and round half-up to pennies.
3. Add sterling net and VAT exactly to produce sterling gross.

Store and show both calculations. The client-currency VAT and statutory sterling VAT are independently rounded, so converting one back into the other may differ by one minor unit.

### Defaults, corrections, and immutable values

Selecting a client copies its currency, day rate, VAT treatment, and other defaults into the draft. Later client edits affect future drafts only. Reselecting a client may replace copied facts, but requires confirmation if the user has edited them. Immediately before issue, re-read only the client's locked prefix and next invoice number.

A full credit note does not recalculate the original invoice. It negates the stored client-currency and sterling net, VAT, and gross amounts exactly, and copies the original currency precision, VAT rate, tax point, exchange record, and wording. Its issue date must be on or after the original invoice's issue date and no later than the current business date. Its non-empty correction reason must satisfy the multiline text limits and renderer-fit check.
