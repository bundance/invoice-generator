# History and credit notes

## User behavior

Invoices lists immutable issued records and their exact retained PDFs. Each record offers Open, Export, and Print. Correct starts a full-credit flow without changing the original invoice. A valid full credit note reverses the original amounts, keeps tax and exchange facts, requires a correction reason and valid date, and links both retained documents. Afterward, the owner can stop or create an editable, unnumbered replacement that keeps the original and credit unchanged. Issuing that draft adds the client's next invoice to the same correction chain. Full credit notes wrap onto additional A4 pages and use the same generated-PDF preview as invoices. Partial credits are unavailable.

## Source entry points

- `src/renderer/features/invoices/invoices-page.tsx`
- `src/renderer/features/invoices/invoice-history-item.tsx`
- `src/renderer/features/invoices/retained-document-actions.tsx`
- `src/renderer/features/invoices/full-credit-note-flow.tsx`
- `src/renderer/features/invoices/credit-note-complete.tsx`
- `src/renderer/features/invoices/credit-note-history-item.tsx`
- `src/renderer/features/invoices/correction-chains.ts`
- `tests/e2e/invoice-issue.spec.ts`

## Live recipe

From an issued invoice, confirm the immutable facts and Open, Export, Print, and Correct controls. Open Correct, enter a correction reason and valid issue date, and compare the credit preview with the original. For a multi-page original, scroll through every credit page and check the original reference, page counters, reversed items and one set of totals. Review and issue the full credit note. Confirm the completion screen offers both `Create replacement` and `Done` without consuming the next number. Create the replacement, confirm its source, current issuer, current client, and next-if-issued number are explicit, then issue it. Confirm history groups the original, `CN-` record, and replacement in one correction chain and every record keeps its document actions.
