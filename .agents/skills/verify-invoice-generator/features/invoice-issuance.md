# Invoice issuance

## User behavior

Review validates every generated A4 page before showing the final issue dialog. The app issues outside-scope invoices, GBP UK VAT invoices, and foreign-currency UK VAT invoices with sterling VAT evidence. Only the final successful issue consumes the proposed number. Issuance retains an immutable PDF and moves the record to Invoices. A failed pre-commit step keeps the draft and number available.

## Source entry points

- `src/renderer/features/invoice-draft/use-invoice-draft-review.ts`
- `src/renderer/features/invoice-draft/use-invoice-issue.ts`
- `src/renderer/features/invoice-draft/invoice-issue-dialog.tsx`
- `src/renderer/features/invoice-draft/invoice-preview.tsx`
- `src/infrastructure/electron/invoice-pdf.tsx`
- `tests/e2e/invoice-issue.spec.ts`

## Live recipe

Complete a valid draft, click `Review and issue`, and inspect the confirmation dialog against the preview. Keep editing once and confirm the draft remains. Reopen review, issue the proposed invoice, and confirm the app opens Invoices with the same invoice ID and totals. For a multi-page invoice, confirm all service items appear once in order and the totals appear once. Export the retained PDF and compare its pages with the preview. Capture the dialog and issued record.
