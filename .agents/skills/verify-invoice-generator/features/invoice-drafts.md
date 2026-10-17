# Invoice drafts

## User behavior

Create invoice stays in setup mode until issuer and client records exist. A ready workspace gets one editable draft with Client, Work, and Tax & issue tabs beside a preview of the actual generated PDF. Items wrap onto additional A4 pages automatically. Fit, manual zoom, scrolling, loading, and Retry apply to those PDF pages. Edits autosave locally. Restart offers to resume or discard a recovered draft. Changing the selected client asks before replacing draft details. Drafting, discarding, and failed review do not consume a number.

## Source entry points

- `src/renderer/features/invoice-draft/create-invoice-page.tsx`
- `src/renderer/features/invoice-draft/invoice-draft-studio.tsx`
- `src/renderer/features/invoice-draft/invoice-draft-inspector.tsx`
- `src/renderer/features/invoice-draft/use-invoice-draft-form.ts`
- `src/renderer/features/invoice-draft/draft-recovery-dialog.tsx`
- `tests/e2e/invoice-draft.spec.ts`

## Live recipe

With issuer and client setup complete, open Create invoice. Fill a service period and billable days in Work, then fill the issue date in Tax & issue. Confirm `Saved on this Mac` and check that the preview shows the client, dates, and totals. Add enough items to create another page, then scroll through every page and check repeated headings and page counters. Check Fit and manual zoom, including returning from 100% to Fit in a large window. Edit an item and confirm the refreshed PDF contains it before review becomes available. Capture the populated draft before review.
