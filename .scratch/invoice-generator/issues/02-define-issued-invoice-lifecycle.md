# Define the issued-invoice lifecycle

Type: grilling
Status: resolved
Blocked by: none

## Question

What states may an invoice enter before and after issue, when is its number consumed, how are failed or cancelled issues recorded, and must the app create linked correction documents or stop at voiding and replacement?

## Answer

The app has one automatically recovered invoice draft. It is editable, has no invoice ID, and may be discarded without consuming an invoice number. It is not part of a saved-draft collection.

Issue is the single durable transition from that draft to an immutable issued invoice:

- Validation and PDF preparation happen before the durable commit and do not consume a number.
- The commit stores the exact invoice snapshot and PDF while advancing the client's invoice number. Once committed, that number is permanent.
- Failure or cancellation before the commit leaves the draft recoverable and creates no historical record.
- Failure to open, export, or print after the commit does not undo issue. The retained PDF remains available for exact re-export.
- If recovery finds a consumed invoice number without a surviving invoice, the app retains a voided-number record containing the invoice ID, timestamp, and reason. This is a recovery safeguard, not a normal user action.

An issued invoice never becomes editable or deleted. Post-issue correction uses immutable linked documents:

- One full credit note may reverse an issued invoice. Its ID is derived as `CN-<INVOICE-ID>`.
- The credit note reverses the original net, VAT, and gross amounts using the original currency, VAT treatment, VAT rate, tax point, and sterling conversion evidence.
- It has its own current issue date, requires a genuine correction reason, and references the original invoice ID and issue date. Bad debt is not a valid credit-note reason.
- The original remains unchanged. The credit-note link makes it fully credited.
- After the credit note is issued, the user may create an editable replacement draft copied from the original. The replacement is calculated independently and receives a new invoice ID only when issued.
- The replacement link makes the original replaced. A replacement may later be fully credited and replaced again, producing an auditable chain.
- Partial credit notes, debit notes, supplementary invoices, payment status, delivery status, and a general void-issued-invoice action are outside this lifecycle.
