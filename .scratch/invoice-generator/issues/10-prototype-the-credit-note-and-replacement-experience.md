# Prototype the credit-note and replacement experience

Type: prototype
Status: resolved
Blocked by: 06

## Question

What concrete history actions, confirmation steps, linked-document presentation, full-credit-note A4 layout, and replacement-draft flow let the user correct an issued invoice without implying that the original changed?

## Comments

### Prototype ready for review

- Asset: [Invoice correction experience prototype](../prototypes/invoice-creation/README.md)
- Run from the repository root with `vp run prototype:invoice-creation`, then open `http://127.0.0.1:4173/correction.html?variant=A`.
- `A` is Guided correction: a guarded three-step flow that reveals one decision at a time.
- `B` is Document chain: the original, full credit note, and optional replacement stay visible as a linked sequence.
- `C` is Audit workspace: a compact document record and preview sit beside a persistent correction drawer.
- Each variant requires a genuine reason, previews the full A4 credit note, uses a final issue confirmation, keeps the original unchanged, and creates an unnumbered editable replacement only after the credit note is issued.

The human chose `A`, Guided correction. `B` and `C` remain in the prototype as rejected primary-source evidence.

## Answer

Use the Guided correction flow:

- Show `Correct...` only for an issued invoice that has no full credit note. Open the correction as a dedicated three-step flow from Invoices.
- Keep the original invoice summary, state, total, and retained-PDF action visible throughout the flow. State plainly that the original invoice and PDF will not change.
- Step 1 creates the full credit note. Show a live A4 preview beside the original. Require a genuine correction reason and explain that bad debt is not a correction reason. Default the credit-note issue date to today and allow it to change until issue.
- Copy the original currency, VAT treatment, VAT rate, tax point, sterling conversion evidence, service quantity, rate, and totals into the credit note. The user cannot edit those copied facts. The credit note reverses every net, VAT, and gross amount.
- Lay out the credit note as the fixed invoice document with a `CREDIT NOTE` title, `CN-<INVOICE-ID>` identifier, current issue date, client snapshot, original invoice identifier and issue date, negative service amount and totals, correction reason, currency statement, VAT evidence, and issuer details.
- Use `Review and issue credit note` to open a final confirmation. Show the credit-note identifier, original invoice identifier, full negative total, reason, date, VAT treatment, and the irreversible effect. `Issue CN-<INVOICE-ID>` is the only action that creates the credit note.
- Step 2 confirms that the credit note was issued, the original is fully credited, and both exact PDFs are retained. Offer actions to open either document before moving on.
- Step 3 offers an optional `Create replacement draft` action. Copy the original client and service facts into the one recoverable invoice draft, but do not copy an invoice identifier. The user edits the incorrect facts in New Invoice, and the replacement receives its own next client number only when issued.
- If another invoice draft already contains work, do not overwrite or merge it. Ask the user to keep that draft or discard it before creating the replacement.
- In history, mark the original `Fully credited` and replace `Correct...` with `View chain`. Present the chain in time order as original invoice, full credit note, and any issued replacement. Repeat the same links if a replacement is later credited and replaced again.

The Guided correction layout is the implementation direction. Keep the Document chain and Audit workspace variants only as decision evidence.
