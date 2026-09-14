# Workspace and settings

## User behavior

A fresh launch creates an empty local workspace and opens Create invoice with setup guidance. The top bar routes between Create invoice, Invoices, Clients, and Settings. Settings saves issuer identity, VAT, timezone, and bank details for future documents. Existing issued documents do not change. Settings also creates validated whole-dataset ZIP backups and inspects a selected backup before a confirmed replacement restore.

## Source entry points

- `src/renderer/app/top-bar.tsx`
- `src/renderer/app/workspace-page.tsx`
- `src/renderer/features/issuer-settings/settings-page.tsx`
- `src/renderer/features/issuer-settings/dataset-backup-card.tsx`
- `src/infrastructure/persistence/dataset-archive.ts`
- `src/infrastructure/electron/main.ts`
- `tests/e2e/electron-foundation.spec.ts`
- `tests/e2e/dataset-backup.spec.ts`
- `tests/e2e/issuer-settings.spec.ts`

## Live recipe

Start fresh. Confirm `Set up your workspace` and `Stored on this Mac`. Open each top-bar destination and confirm its page heading. In Settings, confirm the unencrypted-data warning and the `Create backup` and `Restore backup` actions. Enter a complete issuer, save, and capture the `Saved on this Mac` state. Use the production Electron journey for native file selection, invalid archive rejection, restore cancellation, the summarized replacement confirmation, reload, and post-restore issue.
