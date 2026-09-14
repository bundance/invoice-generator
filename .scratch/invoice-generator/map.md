# Invoice generator decision map

## Destination

Produce an implementation-ready product and architecture specification for a single-user, offline Electron invoice generator. The specification must remove every material product, domain, persistence, PDF, tooling, validation, and packaging decision that would otherwise be left to implementation.

## Notes

- Wayfinding produces decisions and specifications only. Production implementation is outside this effort.
- Use `CONTEXT.md` as the domain glossary and update it as language is resolved.
- Use `docs/Codernetic-invoice-GGIOHK-0043.pdf` as the sole invoice-layout reference.
- The fixed layout exposes structured issuer, client, and invoice data. It is not a template editor.
- The app has one service line measured in fractional billable days, one ISO currency per client, immutable issued invoices, and client-specific invoice sequences.
- The app is offline and single-user. Its four destinations are New Invoice, Invoices, Clients, and Settings.
- New Invoice uses a form beside a live A4 preview. The preview and PDF share one rendering model.
- Consult `domain-modeling`, `pdf`, `building-components`, `react-coding-style`, and `typescript-best-practices` when their concerns enter a ticket.

## Decisions so far

- [Establish UK VAT and invoice-record rules](issues/01-establish-uk-vat-and-invoice-record-rules.md) - Keep VAT treatment separate from the statutory rate, preserve issued records and sequence gaps, and apply HMRC currency and correction rules where UK VAT is due.
- [Define the issued-invoice lifecycle](issues/02-define-issued-invoice-lifecycle.md) - Keep one recoverable unnumbered draft, consume a number only at durable issue, and correct immutable invoices with full credit notes and new replacements.
- [Research the current Electron and React toolchain](issues/03-research-the-current-electron-react-toolchain.md) - Pin a Vite+ 0.3, Electron 44, React 19, and TypeScript 7 stack, then replace the plugin checkout only through a validated clean app candidate.
- [Define the local data contract](issues/04-define-the-local-data-contract.md) - Keep one versioned JSON state file and exact issued PDFs in fixed app storage, with atomic saves, release-specific format conversion, and manual whole-dataset backup and restore.
- [Choose the platform and packaging boundary](issues/05-choose-the-platform-and-packaging-boundary.md) - Ship one locally built Apple Silicon disk image for macOS 26 or later, with ad hoc signing, a manual Gatekeeper override, and manual app replacement for updates.
- [Prototype the invoice-creation experience](issues/06-prototype-the-invoice-creation-experience.md) - Use the document-led studio: a persistent A4 canvas, sectioned inspector, explicit final issue confirmation, immutable history, and blocking restore-only recovery.
- [Specify calculation and form-validation rules](issues/09-specify-calculation-and-form-validation-rules.md) - Use exact decimal arithmetic and renderer-fit validation with explicit date, identifier, ISO-currency, VAT, exchange, and immutable correction invariants.
- [Prototype the credit-note and replacement experience](issues/10-prototype-the-credit-note-and-replacement-experience.md) - Use a three-step guided correction that preserves the original, issues one full linked credit note, and then offers an unnumbered replacement draft.
- [Prove the PDF rendering approach](issues/07-prove-the-pdf-rendering-approach.md) - Use one shared A4 renderer for preview and Electron export, retain identifier-named PDFs, block measured overflow, and verify structure plus an approved visual baseline.
- [Define the validation and acceptance contract](issues/08-define-the-validation-and-acceptance-contract.md) - Gate completion on one deterministic validation command, representative real-Electron journeys, injected recovery failures, calibrated PDF comparisons, packaging checks, and final human release evidence.

## Not yet specified

## Out of scope

- Network requests, cloud synchronization, remote databases, accounts, authentication, and multi-user collaboration.
- Alternate invoice layouts, themes, arbitrary styling, or a drag-and-drop document designer.
- Multiple service lines, hourly billing, expenses, mixed rates, and optional commercial fields absent from the reference invoice. Legally required issuer, client, tax-point, VAT, and currency-conversion facts remain in scope.
- [Partial credit notes, debit notes, and supplementary invoices](issues/02-define-issued-invoice-lifecycle.md); corrections use a full credit note and optional replacement.
- [Payment, delivery, and manual void status](issues/02-define-issued-invoice-lifecycle.md); the app records document history but does not track collection or delivery.
- Dashboards, analytics, and a guided onboarding flow.
- Production implementation during this Wayfinder effort.
