# Invoice generator implementation specification

Status: ready-for-agent

## Problem Statement

The issuer's owner currently prepares professional-services invoices without a small application that captures the business rules, preserves issued records, produces the fixed Codernetic layout, and makes corrections auditable. Manual documents leave calculation, numbering, VAT treatment, foreign-currency conversion, record retention, and correction behavior open to mistakes.

The replacement must be dependable without becoming a general accounting system. It is a single-user, offline desktop application for Apple Silicon Macs owned by the issuer. It must preserve one recoverable invoice draft, immutable issued invoices and full credit notes, exact retained PDFs, client-specific invoice sequences, and the evidence needed to understand every historical document. It must also remain installable and maintainable without paid Apple distribution services, servers, accounts, or an elaborate recovery system.

## Solution

Build a local Electron application with four destinations: New Invoice, Invoices, Clients, and Settings. New Invoice uses the approved Document studio experience, with a fixed A4 document canvas beside a focused inspector. The user maintains issuer and client defaults, prepares one automatically saved invoice draft, validates it against the agreed domain rules, reviews the exact proposed document, and explicitly issues it. Issue is the only action that consumes the client's next invoice number.

Every issued invoice and credit note is an immutable snapshot. The application prepares and verifies the final PDF before the durable state commit, retains those exact bytes indefinitely, and reopens or exports the retained artifact rather than regenerating history. Corrections create one full credit note linked to the original, followed by an optional unnumbered replacement draft with its own future invoice ID.

Store the complete dataset locally as one versioned JSON state file plus retained PDFs. Use a temporary-file-and-rename protocol for state changes, a blocking Restore screen for unreadable data, and manual whole-dataset backup and replacement restore. Ship one locally built arm64 DMG for macOS 26 or later with an ad hoc application signature and manual updates.

Keep most business behavior behind one main-process application service. Feed preview and export from one shared document renderer. Verify the complete product through deterministic domain and persistence tests, focused React interaction tests, Playwright journeys against the production Electron build, real PDF checks, and package inspection under one `vp run validate` command.

## User Stories

1. As the issuer's owner, I want the application to open directly to New Invoice, so that I can start the task I use most without passing through a dashboard.
2. As the issuer's owner, I want persistent access to New Invoice, Invoices, Clients, and Settings, so that I can move between the four jobs without losing my place.
3. As the issuer's owner starting with an empty dataset, I want New Invoice to tell me that issuer and client setup is required, so that I know why I cannot issue a document yet.
4. As the issuer's owner starting with an empty dataset, I want direct links from New Invoice to issuer settings and first-client creation, so that setup takes the shortest route.
5. As the issuer's owner with no issued invoices, I want Invoices to explain that history is empty and link to New Invoice, so that the empty page still gives me a useful next action.
6. As the issuer's owner with no clients, I want Clients to offer `Create first client`, so that I can establish the first invoice sequence.
7. As the issuer's owner, I want Settings to remain usable with an empty dataset, so that I can enter issuer and bank details or restore a backup.
8. As the issuer's owner, I want one recoverable invoice draft, so that unfinished work survives navigation and application restarts without creating a draft-management system.
9. As the issuer's owner, I want the draft to remain unnumbered, so that experimentation, validation, cancellation, and discard never consume an invoice number.
10. As the issuer's owner, I want visible `Saving`, `Saved on this Mac`, and `Could not save draft` feedback, so that I know whether my latest edits are durable.
11. As the issuer's owner, I want a failed draft save to preserve my in-memory edits and offer Retry, so that a temporary filesystem problem does not erase the work visible on screen.
12. As the issuer's owner, I want a failed current-draft save to prevent issue confirmation, so that the application never issues from state it could not preserve.
13. As the issuer's owner, I want to discard the invoice draft without consuming a number, so that I can abandon work cleanly.
14. As the issuer's owner, I want the A4 document to remain the dominant part of New Invoice, so that I edit with the resulting invoice in view.
15. As the issuer's owner, I want Client, Work, and Tax & issue sections in a focused inspector, so that the form stays readable beside the document.
16. As the issuer's owner, I want a logical keyboard order through navigation, form sections, preview controls, and issue actions, so that repetitive invoicing does not require constant pointer movement.
17. As the issuer's owner, I want persistent field labels and nearby validation messages, so that incomplete or invalid values are clear while I edit.
18. As the issuer's owner, I want field errors to appear after blur or the first issue attempt and then update as I type, so that validation is helpful without interrupting initial entry.
19. As the issuer's owner, I want an invalid numeric input to make its preview value unavailable rather than appear as zero, so that malformed input cannot look like a genuine amount.
20. As the issuer's owner, I want an issue attempt with errors to show a linked summary and move focus to it, so that I can work through every blocking problem.
21. As the issuer's owner, I want the issue action to remain available while the draft is invalid, so that I can ask the application what still needs fixing.
22. As the issuer's owner, I want selecting a client to copy its currency, day rate, VAT treatment, and other defaults into the draft, so that common facts need not be re-entered.
23. As the issuer's owner, I want confirmation before reselecting a client overwrites draft facts I edited, so that changing the client does not silently discard work.
24. As the issuer's owner, I want later client changes to affect future drafts only, so that current drafts and issued records do not change unexpectedly.
25. As the issuer's owner, I want the proposed next invoice ID shown in context as a preview, so that I can see the expected identifier without mistaking it for an issued number.
26. As the issuer's owner, I want each client to have an independent invoice prefix and next number, so that each client retains its own consecutive series.
27. As the issuer's owner, I want to choose a positive starting number before a client's first issue, so that the application can continue an existing sequence.
28. As the issuer's owner, I want a client's invoice prefix locked after its first issue, so that later editing cannot break historical identifiers.
29. As the issuer's owner, I want invoice numbers displayed with at least four digits and allowed to grow beyond four, so that identifiers remain familiar without imposing an artificial ceiling.
30. As the issuer's owner, I want every consumed invoice number to remain unavailable forever, so that issue failures and historical corrections cannot create reused identifiers.
31. As the issuer's owner, I want recovery to retain a voided invoice number if a consumed number has no surviving invoice, so that an unavoidable sequence gap remains explained.
32. As the issuer's owner, I want to invoice one service line in positive quarter-day increments, so that the application matches the issuer's professional-services model.
33. As the issuer's owner, I want billable days limited to the inclusive invoice period, so that the quantity cannot exceed the calendar span being invoiced.
34. As the issuer's owner, I want completed-service dates to satisfy period start through period end through issue date through today, so that future or internally inconsistent invoices cannot issue.
35. As the issuer's owner, I want the configured business timezone to define today's date, so that travel or a Mac timezone change does not alter issue eligibility.
36. As the issuer's owner, I want every active ISO 4217 client currency available with its minor-unit precision, so that amounts use the currency's real decimal rules.
37. As the issuer's owner, I want currency codes shown wherever a symbol is ambiguous, so that the document cannot be misread.
38. As the issuer's owner, I want exact decimal arithmetic and half-up rounding, so that totals never depend on binary floating-point behavior.
39. As the issuer's owner, I want net calculated from billable days and day rate, VAT calculated from rounded net, and gross calculated as rounded net plus rounded VAT, so that the invoice follows one explicit calculation order.
40. As the issuer's owner, I want UK-taxable and outside-scope VAT treatments to remain distinct, so that no-VAT overseas work is not described as UK VAT charged at zero percent.
41. As the issuer's owner, I want a UK-taxable invoice to require an explicit positive VAT rate no greater than 100 percent, so that a malformed rate cannot issue.
42. As the issuer's owner, I want an outside-scope invoice to have no numeric VAT rate and require an evidence reference, so that the stored record explains the treatment.
43. As the issuer's owner, I want reverse-charge wording to be an explicit option only for outside-scope work, so that an overseas client does not trigger it automatically.
44. As the issuer's owner, I want a foreign-currency UK-taxable invoice to require an exchange record current at the tax point, so that the sterling VAT figures retain their source and method.
45. As the issuer's owner, I want the exchange rate expressed as units of client currency per pound sterling, so that input and calculation direction cannot be confused.
46. As the issuer's owner, I want a separate sterling net, VAT, and gross summary calculated from the stored exchange record, so that the invoice contains the statutory sterling figures without replacing client-currency totals.
47. As the issuer's owner, I want the tax point required between the period end and issue date for UK-taxable work, so that VAT is tied to a valid date.
48. As the issuer's owner, I want an issue date more than 14 days after the period end to produce a warning rather than an invented legal rejection, so that I can confirm the tax point after checking the relevant exception.
49. As the issuer's owner, I want that warning repeated in the final confirmation and its acknowledgement stored, so that the issued snapshot records what I checked without claiming the app supplied tax advice.
50. As the issuer's owner, I want identifiers and structured values normalized while names and prose retain their meaningful capitalization and punctuation, so that stored data is consistent without rewriting business text.
51. As the issuer's owner, I want defensive grapheme limits and renderer-fit checks, so that unreasonable input and visible clipping both block issue.
52. As the issuer's owner, I want a final issue confirmation showing identifier, client, total, dates, VAT treatment, warnings, and the irreversible effect, so that I can catch a material mistake before committing.
53. As the issuer's owner, I want the final action labelled with the exact invoice ID, so that the number-consuming action is unmistakable.
54. As the issuer's owner, I want issue confirmation to contain focus, close on Escape, and restore focus to its trigger, so that cancelling the irreversible action returns me to the right place.
55. As the issuer's owner, I want the application to repeat normalization, parsing, validation, calculation, sequence lookup, and renderer-fit checks immediately before commit, so that stale confirmation data cannot issue.
56. As the issuer's owner, I want PDF preparation and verification to finish before the state commit, so that a rendering failure preserves the draft and next number.
57. As the issuer's owner, I want the durable state commit to be the only point that consumes the number, so that pre-commit failure has one clear meaning.
58. As the issuer's owner, I want successful issue to create an immutable snapshot and retain the exact verified PDF, so that later settings and client changes cannot rewrite history.
59. As the issuer's owner, I want Invoices to show identifier, client, issue date, total, document state, and retained-PDF actions, so that history is useful without opening every document.
60. As the issuer's owner, I want to search invoice history by identifier or client, so that I can find an old document quickly.
61. As the issuer's owner, I want opening, exporting, or printing after issue to use the retained PDF, so that historical output is never regenerated.
62. As the issuer's owner, I want a post-commit open or export failure to leave issue intact and permit retry, so that an output action cannot undo a legal record.
63. As the issuer's owner, I want `Correct...` available only for an invoice without a full credit note, so that the same invoice cannot be reversed twice.
64. As the issuer's owner, I want correction to open as the approved three-step Guided correction flow, so that the original, reversal, and optional replacement remain conceptually separate.
65. As the issuer's owner, I want the original summary and retained-PDF action visible while preparing the credit note, so that I can compare the correction with the unchanged source.
66. As the issuer's owner, I want a live A4 credit-note preview and a required genuine correction reason, so that I can inspect the new legal document before issue.
67. As the issuer's owner, I want the application to explain that bad debt is not a correction reason, so that a full credit note is not misused as debt write-off tracking.
68. As the issuer's owner, I want a credit note to copy and exactly negate the original stored amounts and tax facts, so that rounding or later defaults cannot alter the reversal.
69. As the issuer's owner, I want the credit-note date constrained between the original issue date and the current business date, so that the correction timeline remains valid.
70. As the issuer's owner, I want credit-note confirmation to show its ID, original invoice, full negative total, reason, date, VAT treatment, and irreversible effect, so that the second immutable document is explicit.
71. As the issuer's owner, I want the issued credit note to leave the original unchanged and mark it fully credited, so that the history remains auditable.
72. As the issuer's owner, I want both exact PDFs available after credit, so that either side of the reversal can be inspected or exported.
73. As the issuer's owner, I want the option to create an unnumbered replacement draft from the original facts, so that I can correct the mistake without editing history.
74. As the issuer's owner, I want an existing invoice draft kept or discarded by explicit choice before creating a replacement, so that correction cannot overwrite unrelated work.
75. As the issuer's owner, I want the replacement to receive its own next client number only when issued, so that copying it does not consume a number.
76. As the issuer's owner, I want `View chain` to show the original, full credit note, and issued replacement in time order, so that repeated corrections can be followed.
77. As the issuer's owner, I want a replacement invoice to support the same full-credit-and-replacement process, so that a second correction extends the chain without mutating earlier documents.
78. As the issuer's owner, I want Clients to provide a searchable list and editor, so that defaults and client sequences can be maintained without exposing raw data.
79. As the issuer's owner, I want Settings to separate issuer details, bank details, and dataset backup, so that application configuration remains easy to scan.
80. As the issuer's owner, I want the application version shown in Settings, so that I can identify the installed release before manually replacing it.
81. As the issuer's owner, I want Create backup to produce one complete archive of state and every referenced PDF, so that one file can preserve the authoritative dataset.
82. As the issuer's owner, I want a warning that backups are unencrypted, so that I can protect the financial and personal information using operating-system controls.
83. As the issuer's owner, I want Restore to validate and summarize an archive before confirmation, so that I can see what will replace the current dataset.
84. As the issuer's owner, I want restore confirmation to state that replacement is complete and no records will merge, so that its destructive scope is clear.
85. As the issuer's owner, I want cancellation or failure before restore commit to leave the current dataset unchanged, so that trying a bad archive cannot damage working data.
86. As the issuer's owner, I want unreadable, invalid, or newer-version state to stop normal use without modifying the dataset, so that the application never guesses at financial records.
87. As the issuer's owner, I want the blocking recovery screen to offer only a validated replacement backup or Quit, so that recovery remains understandable and safe.
88. As the issuer's owner, I want a newer application version to convert only a known older data version through a tested release-specific conversion, so that format changes are explicit.
89. As the issuer's owner, I want an older application to refuse a newer data version without touching it, so that manual downgrade cannot corrupt the dataset.
90. As the issuer's owner, I want only one running application instance to write the dataset, so that simultaneous processes cannot race invoice sequences or state replacement.
91. As the issuer's owner, I want the application to operate without network requests, accounts, or authentication, so that invoicing remains private and available offline.
92. As the issuer's owner, I want one arm64 DMG that installs by dragging the app into Applications, so that I can use the same artifact on the Apple Silicon Macs I own.
93. As the issuer's owner, I want the app to preserve its dataset when I manually replace it with a newer version, so that updates do not require export and import.
94. As the issuer's owner, I want a clear refusal when an older build encounters a newer data format, so that manual replacement cannot silently downgrade records.
95. As the application maintainer, I want one authoritative validation command that includes Vite+ checks, anti-slop lint rules, React Doctor, and Fallow, so that implementation completeness has a reproducible meaning.
96. As the application maintainer, I want tests to use fixed time, isolated data, deterministic fixtures, and explicit failures, so that passing evidence is repeatable.
97. As the application maintainer, I want failed acceptance runs to retain traces, screenshots, logs, and their isolated dataset, so that a failure can be reproduced without contaminating the real dataset.
98. As the application maintainer, I want successful runs to remove temporary evidence and produce a concise named-check report, so that validation does not leave noisy state behind.
99. As the application maintainer, I want visual baselines changed only through deliberate human approval, so that a rendering regression cannot bless itself.
100. As the application maintainer, I want the production renderer isolated from Node and exposed to a narrow typed preload API, so that local financial data is not available through an unrestricted renderer bridge.

## Implementation Decisions

### Product and navigation

- Build a single-user, offline desktop application for the issuer's owner. The application has no account, login, remote service, or multi-user state.
- Keep exactly four top-level destinations: New Invoice, Invoices, Clients, and Settings. New Invoice is the default. Do not add a dashboard.
- Use the approved Document studio as the production direction. The live A4 document is the dominant canvas. A focused inspector owns Client, Work, and Tax & issue sections.
- Use the approved Guided correction flow for full credit notes and replacement drafts. Rejected prototype variants remain decision evidence and do not ship.
- Keep the fixed Codernetic invoice layout. Structured business data may vary, but users cannot rearrange or restyle the document.
- Keep labels visible. Show validation beside fields and in a linked summary after an issue attempt. Keep the issue action discoverable while invalid.
- Keep keyboard order and focus behavior as functional requirements. Formal accessibility conformance, screen-reader behavior, and assistive-technology testing are not release requirements for this one-user internal application.

### Application structure and test boundaries

- Put business operations behind one main-process application service. It owns settings, clients, the invoice draft, issue, credit, replacement, backup, restore, document lookup, and export commands and queries.
- Give the application service explicit dependencies for the dataset repository, document preparation, clock, archive input and output, and operating-system file actions. Tests replace these dependencies only to control time, isolate storage, select files, or force a named failure. Do not expose fault controls in production UI or production preload APIs.
- Expose the application service to the renderer through a narrow typed preload API built with `contextBridge`. Do not expose `ipcRenderer`, filesystem access, Electron modules, or a generic invoke function.
- Keep the renderer responsible for presentation and transient interaction state. Store canonical business data once in the main-process application service and derive display values rather than duplicating them into effect-driven React state.
- Build one pure document render model from a validated invoice or credit-note snapshot. Feed that model to one shared A4 React document component for both the live preview and PDF export.
- Treat the production Electron application as the outer acceptance boundary. Playwright drives its real windows, preload, IPC, filesystem, and lifecycle behavior. Package inspection verifies the resulting DMG.
- Use focused React tests only where they provide faster, clearer coverage of form interaction, validation timing, visible status, dialog behavior, or focus than a full Electron journey. Do not duplicate every acceptance journey in jsdom.

### Issuer, clients, and draft

- Store one current issuer with legal name, registered address, canonical nine-digit VAT registration number, company number in certificate form, bank details, standard VAT rate, and IANA business timezone. Default the timezone to `Europe/London`.
- Preserve the company number exactly in its significant certificate form. For Codernetic, store and print `8822243`. Accept one to eight uppercase letters or digits. Do not add Companies House lookup padding or a `GB` prefix.
- Accept a UK VAT registration number with optional `GB` and spaces at input, then store its canonical nine digits. Add `GB` only where document context requires it.
- Accept common separators in bank inputs, then require a six-digit sort code and eight-digit account number. These checks prove syntax, not ownership or registry truth.
- Store clients with legal name, postal address, unique invoice prefix, next invoice number, client currency, standard day rate, VAT treatment defaults, and relevant VAT defaults or evidence prompts.
- Normalize an invoice prefix to uppercase and require 2 to 12 ASCII letters or digits. Prefix uniqueness is case-insensitive across all clients. The hyphen is reserved for the prefix-number separator.
- Default a new client's starting number to 1 and permit any positive integer before first issue. Lock its prefix after the first issue.
- Maintain exactly one recoverable invoice draft or `null`. The draft stores raw, possibly incomplete inputs. It has no invoice ID and is not part of a draft collection.
- Selecting a client copies client defaults into the draft. Later settings or client changes never remain live references in that draft. Confirm before a client reselection replaces facts the user edited.
- Re-read only the selected client's locked prefix and next invoice number immediately before issue. All other issued facts come from the newly validated candidate snapshot.

### Validation and normalization

- Permit incomplete or malformed raw values in the draft. Never represent the draft itself as an invoice snapshot.
- Normalize, parse, and validate a fresh candidate before opening issue confirmation. Repeat the full process immediately before the durable commit.
- Require issuer legal name, registered address, VAT registration number, company number, bank details, client legal name and postal address, service description, invoice period, billable days, day rate, client currency, issue date, invoice prefix, and proposed invoice number. Add VAT-treatment-specific facts as described below.
- Normalize issued text to Unicode NFC and line endings to LF. Trim outer whitespace. Collapse internal whitespace only in single-line fields. Preserve meaningful line breaks in addresses, service descriptions, correction reasons, and evidence references. Reject disallowed control characters.
- Allow at most 200 graphemes in a normalized single-line field and 1,000 graphemes in a normalized multiline field. These are storage limits. Every variable document region must also pass actual renderer-fit measurement.
- Determine the current calendar date from the issuer's stored IANA business timezone. Store that timezone, each calendar date, and the UTC issue timestamp in the issued snapshot.
- Require real calendar dates satisfying `periodStart <= periodEnd <= issueDate <= today`.
- Require positive billable days in quarter-day increments. Do not allow billable days to exceed the inclusive number of calendar days in the invoice period.
- Treat an issue date more than 14 days after the period end as the only non-blocking validation warning. Repeat it in confirmation, require explicit acknowledgement that the tax point was checked, and store the acknowledgement. Do not claim the application validated an HMRC exception.
- Use visible `Saving`, `Saved on this Mac`, and persistent `Could not save draft` states. A failed save keeps the current in-memory draft and offers Retry. Issue cannot proceed until the current draft has saved successfully.

### Currency, VAT, and calculations

- Embed the active ISO 4217 currency list. Store the client currency code and its minor-unit precision in every issued snapshot so later reference-data changes cannot alter history.
- Require a positive day rate with no more fractional digits than the client currency permits.
- Use exact base-10 decimal arithmetic. Never use binary floating point for invoice, VAT, credit-note, or sterling-summary calculations.
- Calculate client-currency net by multiplying billable days by day rate and rounding half-up once to the currency's minor unit.
- For UK-taxable invoices, calculate VAT from the rounded net and round half-up once to the same minor unit. For outside-scope invoices, VAT is exactly zero.
- Calculate gross by adding rounded net and rounded VAT exactly. Do not round gross again. Display each amount with the currency's required fractional digits.
- Model VAT treatment as either UK taxable or outside the scope of UK VAT. Do not model outside-scope work as a zero-percent UK VAT rate.
- UK taxable requires a VAT rate greater than zero and no greater than 100, with at most three decimal places. It forbids reverse charge.
- Outside-scope treatment has no numeric VAT rate, produces zero UK VAT, requires a short evidence or rationale reference, and may include explicitly selected reverse-charge wording.
- Prefill the UK rate from issuer settings but allow a draft override. Reject invalid rates rather than clamping them. Display the shortest exact percentage without unnecessary trailing zeros.
- Require a tax point between period end and issue date for UK-taxable work. Default it to issue date.
- A UK-taxable invoice whose client currency is not GBP requires an exchange record. Store the positive rate as `1 GBP = X` units of client currency with at most 12 significant digits, its effective date, method, evidence reference, and relationship to the tax point.
- Permit HMRC period rate, UK market selling rate, or another HMRC-approved method. Do not fetch an exchange rate.
- Calculate sterling net by dividing rounded client-currency net by the recorded rate and rounding half-up to GBP pennies. Calculate sterling VAT from rounded sterling net and the VAT rate, rounding half-up to pennies. Add those two rounded values exactly for sterling gross.
- Store and display client-currency and sterling calculations independently. Do not force one to equal a back-conversion of the other.

### Issue, sequences, and immutable history

- Format an invoice ID from its client prefix and number, with at least four displayed number digits and no upper display limit. Require complete invoice IDs to be unique across the dataset.
- Make issue the only ordinary operation that consumes the client's next invoice number. Validation, preview, confirmation, PDF preparation, cancellation, and failure before commit do not consume it.
- Prepare the final PDF before the durable state commit. The commit stores the complete issued snapshot, associates the retained PDF, advances the client sequence by exactly one, and clears the invoice draft.
- Treat the atomic state-file rename as the durable commit. A failure before rename preserves the draft and next number. Startup may remove a temporary state file or an unreferenced prepared PDF left by that failure.
- Never edit or delete an issued invoice, credit note, or retained void record through normal application behavior.
- If recovery establishes that a number was consumed without a surviving invoice, retain a voided invoice number with the invoice ID, timestamp, and reason. Advance from that number and never reuse it. Do not expose ordinary manual voiding.
- Store each issued invoice as a complete snapshot of issuer, client, service, currency, VAT, exchange, calculation, date, timezone, warning acknowledgement, identifier, and rendering facts. Never consult mutable settings or current client records to render history.
- Keep the exact issued PDF indefinitely. Opening, exporting, or printing an issued document reads the retained bytes. A post-commit output failure leaves the issued record untouched and permits retry.

### Full credit notes and replacement invoices

- Permit at most one full credit note for an issued invoice. Derive its ID as `CN-<INVOICE-ID>`.
- Copy the original invoice's currency code and precision, VAT treatment, VAT rate, tax point, exchange record, wording, service quantity, day rate, and stored client-currency and sterling totals into the credit-note candidate.
- Negate the original stored net, VAT, and gross amounts exactly. Do not recalculate them from present-day settings or reference data.
- Require a non-empty genuine correction reason under the multiline normalization, grapheme, and renderer-fit rules. Explain that bad debt is not a correction reason.
- Default the credit-note issue date to the current business date. Permit changes from the original invoice issue date through the current business date, inclusive.
- Give the credit note a complete immutable snapshot and exact retained PDF. Link it to the original with `originalInvoiceId`. Keep the original unchanged and derive its Fully credited state from that link.
- Use the fixed document layout with a `CREDIT NOTE` title, credit-note ID, current issue date, client snapshot, original invoice ID and issue date, negative service amount and totals, correction reason, currency statement, VAT evidence, and issuer details.
- Require a final credit-note confirmation. The final action is labelled with the exact credit-note ID and is the only action that creates the credit note.
- After issue, offer an optional replacement invoice draft copied from the original client and service facts. Do not copy an invoice ID. Do not consume a number until the replacement itself issues.
- If the single draft already contains work, require the user to keep it or discard it before creating the replacement. Never merge or overwrite it automatically.
- Store `replacesInvoiceId` on an issued replacement. Present each chain in time order as original invoice, full credit note, and issued replacement. Allow an issued replacement to begin another full-credit-and-replacement link.

### Local dataset, backup, and recovery

- Keep one application-owned dataset in Electron's application-data directory. Do not let users select or relocate the live data directory.
- Allow only the primary application instance to write the dataset. A second launch must not open another writer.
- Store one `state.json` and one application-managed retained-PDF directory. The top-level state contains `schemaVersion: 1`, current issuer settings, clients and their next numbers, the invoice draft or `null`, issued-invoice snapshots, credit-note snapshots, voided numbers, and replacement links.
- Store calendar dates as `YYYY-MM-DD`, event timestamps as UTC ISO 8601 strings, and decimal quantities and money as canonical base-10 strings.
- For every state change, write the complete candidate to `state.json.tmp`, validate it, then rename it over `state.json`. Do not add a transaction journal, automatic rollback, or repair subsystem.
- Validate state and all referenced retained PDFs at startup. If the dataset cannot be read or validated, leave it unchanged, block normal navigation, and show only validated Restore and Quit actions.
- Create backup as one unencrypted archive containing the complete current `state.json` and every referenced retained PDF. The archive is a whole-dataset copy, not an incremental format.
- Validate a selected restore archive completely before confirmation. Summarize its schema version, client count, document counts, and PDF contents. State that restore replaces the current dataset and never merges.
- Prepare restore so that cancellation or failure before its commit leaves the current dataset unchanged. A successful restore makes the selected state and exactly its referenced PDFs the new dataset, then restarts or reloads the application.
- Keep `schemaVersion: 1` until a real contract change exists. A future release may add one tested conversion from a named older version to the current version using the same temporary-write-and-rename discipline.
- Leave unknown and newer versions unchanged and refuse normal use. Do not create a generic migration framework.
- Rely on operating-system storage protection. Do not add application-level encryption. Warn that backup archives contain financial and personal information and are not encrypted by the app.

### Shared document and PDF output

- Use the supplied Codernetic invoice PDF as the sole visual reference. Do not introduce alternate layouts, themes, arbitrary styling, or a document designer.
- Build a pure render model from a validated immutable snapshot and pass it to the shared A4 React document. The live preview mounts that component on a scaled canvas.
- Export in a hidden, sandboxed Electron renderer using the same component and styles. Do not maintain a second print template.
- Wait for fonts and images before measurement. Measure every fixed region containing variable text. Any horizontal or vertical overflow blocks issue.
- Print one CSS-sized A4 page with zero printer margins, backgrounds enabled, CSS page size preferred, and tagged PDF output. Keep document spacing inside the page component.
- Keep document text as HTML text so it remains selectable. Embed the fixed Codernetic wordmark from the approved 334 by 72 pixel image asset. Do not redraw it independently for export.
- Require both representative invoice and full-credit-note output to have one page, embedded fonts, selectable required text, the unchanged wordmark, and no clipped region.
- Name retained PDFs by document ID only, such as `GGIOHK-0043.pdf` or `CN-GGIOHK-0043.pdf`. Use that name as the default external export name. A renamed external copy does not rename the retained file.
- Write and verify the final PDF before the durable issue or credit-note commit. After commit, always serve the exact retained bytes.

### Electron security and offline operation

- Use `vite-plugin-electron/simple` for Electron main and preload builds.
- Keep context isolation and renderer sandboxing enabled. Disable Node integration in the renderer.
- Validate every IPC sender and every input that crosses the preload boundary. Treat external and persisted data as unknown until boundary validation succeeds.
- Deny unexpected navigation and new windows. Reject external URLs rather than silently opening them.
- Make no network request during application use or acceptance tests. Do not add analytics, update checks, hosted reference data, or remote error reporting.
- Use narrow command-specific preload methods with explicit input and output types. Model operation outcomes as discriminated variants where the UI must handle success, validation failure, cancellation, recovery-required state, or operating-system failure.

### Toolchain and repository replacement

- Replace the current plugin-source checkout with a clean Vite React TypeScript application. Do not migrate the plugin's source, playground, package tests, or publish configuration into the product.
- First build the application scaffold in a fresh temporary directory. Validate it there, then apply a reviewed file-by-file replacement to the repository. Preserve product documents, the domain glossary, research, Wayfinder artifacts, and prototype evidence.
- Do not copy or move the checkout's hydrated dependency directory. Remove confirmed plugin-only files only after the candidate application passes its gate.
- Before the first commit, use an explicitly named non-`main` implementation branch. Do not create the first commit on `main`.
- Pin Node 24.20.0 and pnpm 11.25.0.
- Pin Electron 44.1.1, React and React DOM 19.2.8, TypeScript 7.0.2, Vite+ 0.3.0, the matching Vite+ core alias 0.3.0, `vite-plugin-electron` 1.1.2, the React Vite plugin 6.1.1, Tailwind and its Vite plugin 4.3.3, shadcn 4.20.1, and electron-builder 26.15.3.
- Pin the shared shadcn dependencies to class-variance-authority 0.7.1, clsx 2.1.1, lucide-react 1.40.0, tailwind-merge 3.6.0, and tw-animate-css 1.4.0. Add only the Radix packages needed by components the application actually uses. Use the Radix base, `new-york` style, CSS variables, Lucide icons, and Tailwind v4 CSS setup.
- Pin `@types/node` 24.13.3, `@types/react` 19.2.18, and `@types/react-dom` 19.2.6.
- Pin `@testing-library/dom` 10.4.1, `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.7, `@testing-library/jest-dom` 7.0.1, jsdom 30.0.1, and Vitest 4.1.11. Import Vitest APIs through Vite+.
- Pin both Playwright and `@playwright/test` to 1.62.1. The direct Playwright dependency owns the Electron API; the test package owns the scenario runner and assertions.
- Pin Fallow 3.22.0 and React Doctor 0.9.13 as development dependencies so local and hook validation do not float with package-registry changes.
- Declare the direct `vite` dependency as the matching Vite+ core alias. Keep the workspace catalog and overrides for Vite and Vitest so the dependency graph contains one compatible implementation of each.
- Let Vite+ own Vite, Vitest, Oxlint, Oxfmt, type-aware linting, type checking, builds, and task execution. Keep their configuration together rather than retaining standalone plugin-repository configuration.
- Vendor anti-slop from a recorded upstream revision because it intentionally has no official npm package. Register all generic anti-slop rules as errors in Vite+'s Oxlint configuration, and pin `@oxlint/plugins` to the exact Oxlint version resolved by Vite+. Do not enable the optional Effect rules unless the application later depends directly on Effect.
- Use separate referenced TypeScript configurations so renderer code has DOM and Vite client types without Node globals, while Electron and tooling code receive Node types.
- Do not use TypeScript `baseUrl`. Keep source aliases explicit in TypeScript and Vite configuration.
- Keep application runtime dependencies empty unless a main-process package is deliberately externalized or a native runtime module is required. Web and build packages stay in development dependencies because Vite bundles the web code.

### Packaging and updates

- Set the stable application identity to `com.codernetic.invoicegenerator` and the product name to `Invoice Generator`.
- Support macOS 26.0 or later on Apple Silicon arm64 only. Do not build Intel, universal, Rosetta-only, Windows, or Linux artifacts.
- Produce one DMG containing the application and supporting drag-to-Applications installation. Do not produce a package installer, ZIP, Mac App Store build, or another platform artifact.
- Configure electron-builder 26 for arm64 DMG output, ad hoc application signing with identity `-`, disabled hardened runtime, minimum system version 26.0, no notarization, and no DMG signature.
- Require no Apple Developer membership, Developer ID certificate, notarization credential, entitlement set for notarization, release secret, or hosted build service.
- Document the first-launch Gatekeeper flow through System Settings, Privacy & Security, Open Anyway. Accept that one-time manual override on each Mac controlled by the user.
- Build releases locally on a supported Apple Silicon Mac. Do not add release CI, hosted downloads, release publishing, or transfer features.
- Give every build a `MAJOR.MINOR.PATCH` version and display it in Settings.
- Use manual updates. The user quits the application and replaces it from a newer DMG. Keep the stable application identity and fixed data location so replacement preserves the dataset.
- Do not add an update feed, updater library, update button, background download, update status, or automatic rollback.

## Testing Decisions

### What a good test proves

- Test externally meaningful behavior at the highest practical boundary. Prefer application-service commands and queries over internal helper tests, the shared document renderer over formatting helpers, and production Electron journeys over mocked IPC wiring.
- Use the fewest useful seams. The primary seam is the main-process application service. The shared document renderer is a separate artifact seam because state commands cannot prove A4 layout. The production Electron application is the outer user-visible boundary.
- Use real decimal calculations, real state validation, real temporary filesystem operations, real React interactions, and the real Electron renderer whenever the test can run them deterministically. Mock only clocks, user-selected operating-system paths, and failures that cannot be produced safely on demand.
- Assert stored state, retained artifacts, visible outcomes, and consumed sequence numbers. Do not assert private helper calls, React component structure, hook implementation, or incidental intermediate objects.
- Do not impose a percentage code-coverage target. Map every specification requirement to a named automated check or an explicitly human-only check.
- An accepted run has no failed, skipped, pending, quarantined, or retried test. Configure acceptance retries to zero. A pass after an ad hoc rerun does not erase the original failed acceptance run.
- Tests use fixed clocks, fixed business timezones, deterministic fixtures, and fresh temporary application-data directories. Validation never changes snapshots or visual baselines.

### Module coverage

- Domain tests cover text normalization, grapheme limits, identifiers, dates, billable days, currency precision, exact decimal arithmetic, VAT treatments, exchange records, sterling summaries, warning acknowledgements, sequence transitions, invoice snapshots, credit-note negation, and replacement chains.
- Persistence tests cover `schemaVersion: 1`, malformed and schema-invalid state, unknown newer versions, temporary state, orphaned prepared PDFs, retained-PDF references, atomic saves, release-specific conversions, backup creation, archive validation, whole-dataset restore, and second-instance writing.
- Application-service tests cover draft save and discard, client defaults, issue, full credit, replacement creation, retained document lookup, backup, restore, recovery-required state, and every forced operation failure.
- Shared-renderer tests cover invoice and credit-note render models, required document text, fixed-region measurements, overflow rejection, exact wordmark use, and preview/export equivalence.
- Focused React tests cover field-validation timing, error-summary links, visible save status, confirmation contents, Escape behavior, focus containment, focus restoration, draft-conflict choice, and empty-state actions where these are clearer than full Electron setup.
- Playwright tests cover the real production Electron application, its preload, IPC, filesystem, windows, restart behavior, and user-visible flows.
- Package tests cover application architecture, minimum macOS version, signature mode, DMG contents, forbidden artifacts, and installed launch.

### Domain fixture matrix

- Cover currencies with zero, two, and three minor-unit digits.
- Cover half-up boundaries for client-currency net and VAT and the independent sterling calculations.
- Cover GBP UK-taxable invoices, foreign-currency UK-taxable invoices with exchange evidence, and outside-scope invoices with and without reverse-charge wording.
- Cover every lower bound, upper bound, normalization rule, malformed input, and conditional requirement in the validation contract.
- Cover starting number 1, a custom starting number, independent client sequences, case-insensitive prefix collision, growth from four to five digits, consumed numbers, voided numbers, and complete-ID uniqueness.
- Cover one full credit, replacement issue, a second full credit of the replacement, and the next replacement link. Assert exact negation of all original client-currency and sterling stored totals.

### Failure matrix

- Inject failure into draft writes, PDF generation, PDF verification, retained-PDF writes, state temporary writes, candidate-state validation, atomic rename, backup creation, archive validation, restore preparation, and restored-state commit.
- For every failure before durable issue commit, assert that the draft remains recoverable, the next number is unchanged, and no historical document exists.
- For every failure after commit, assert that the issued snapshot, retained PDF, and consumed number remain intact and that the failed secondary action can be retried.
- On startup, assert that cleanup removes only unreferenced temporary files or prepared PDFs. It must never delete a referenced retained PDF or mutate unreadable state.
- For restore cancellation or pre-commit failure, assert that the current dataset remains byte-for-byte usable. For successful restore, assert exact replacement with no records or PDFs from the prior dataset merged into the result.

### Production Electron journeys

1. Start with an empty isolated dataset. Verify all four empty destinations, enter issuer details, and create the first client.
2. Edit a draft, verify the live preview, move between destinations, observe save feedback, restart and recover it, then discard without consuming a number.
3. Attempt invalid issue, use the linked error summary, correct every error, acknowledge the tax-point warning, cancel confirmation, verify focus restoration, then issue from a current valid candidate.
4. Issue an outside-scope invoice and separately exercise explicit reverse-charge wording.
5. Issue a foreign-currency UK-taxable invoice with an exchange record and sterling summary.
6. Force each PDF and durable-state failure and verify the specified visible error plus pre-commit or post-commit guarantees.
7. Issue a full credit note, handle an existing-draft conflict, create and issue a replacement, then create the next credit-and-replacement link.
8. Create a backup, reject an invalid archive, cancel restore, complete whole-dataset replacement, and exercise unreadable, missing-reference, and newer-version recovery states.
9. Search history, open and export exact retained PDFs, verify a locked prefix, change client and issuer defaults, and confirm issued snapshots and PDFs remain unchanged.

The domain suite owns exhaustive value permutations. Electron journeys use representative data and prove integration rather than repeating the full cross-product.

### PDF verification

- Generate representative invoice and full-credit-note PDFs through the real Electron renderer.
- Require identifier-only filenames, one A4 page, embedded fonts, tagged selectable text, all required business and correction text, exact wordmark pixels, and zero measured overflow.
- Include an overlong fixture that must fail the fit gate and prevent issue.
- Rasterize at one fixed DPI in the pinned Electron environment. Render each approved baseline candidate three times and set the documented tolerance to the smallest value that accepts identical repeat renders.
- Freeze renderer version, fonts, scale, DPI, and approved baselines. Any difference outside tolerance requires human review and a deliberate baseline update. Never compare raw PDF bytes and never update a baseline during validation.

### Electron and package verification

- Assert context isolation and renderer sandboxing are enabled and Node integration is disabled.
- Assert the preload exposes only the typed invoice API. Exercise sender and input rejection for every IPC handler.
- Assert unexpected navigation, new windows, and external URLs are rejected.
- Assert every acceptance journey makes zero network requests.
- Assert a second application instance cannot become another dataset writer.
- Build the arm64 DMG and inspect the application binary, minimum macOS version, ad hoc signature, disabled hardened runtime, lack of notarization, unsigned DMG, expected contents, and absence of update or publish metadata and alternate-platform artifacts.

### Authoritative command and evidence

- Establish the quality gate in the first implementation commit. A pre-commit hook runs the same `check:quality` task used by the full validation command, so no later commit can be created unless its quality checks pass.
- `check:quality` runs `vp check`, a full React Doctor scan, and a full Fallow scan in that order. `vp check` runs formatting, type checking, Oxlint's relevant correctness rules, and every generic vendored anti-slop rule. Warnings block React Doctor, no React Doctor rule or category is disabled to make the gate pass, and validation disables score upload and telemetry. Any Fallow finding fails the task.
- Rely on Fallow's built-in Electron and Vite plugins, activated by the application's existing `electron` and `vite` dependencies, and verify their activation with Fallow's plugin listing. Do not add `electron-vite` merely for Fallow detection; the application remains on the approved `vite-plugin-electron` integration.
- `vp run validate` is the single automated completion gate. It runs `check:quality`, domain and persistence tests, React tests, the production build, Playwright Electron journeys, PDF verification, DMG packaging, and automated package inspection in that order.
- A successful run emits a concise report naming every passed stage and scenario and removes temporary successful-run artifacts.
- A failed Playwright scenario retains its trace, screenshots, renderer logs, main-process logs, and isolated dataset.
- Human acceptance installs the final release candidate from its DMG, completes Gatekeeper Open Anyway, launches the installed app, and approves representative invoice and credit-note raster output against the reference and accepted baselines.
- Repeat the relevant human checks after packaging or shared-document-renderer changes. Logic-only changes require only the automated gate.

### Prior art

- The approved invoice-creation and correction prototypes are the interaction reference. They are not production code and their sample calculations are not domain prior art.
- The PDF-rendering prototype proves that one Electron renderer can produce representative one-page invoice and full-credit-note artifacts and provides the starting shape for real PDF verification. Production code must re-establish the proof through the shared renderer and accepted fixtures.
- The current repository's tests exercise `vite-plugin-electron` itself. They do not establish product behavior and must not be retained as invoice-generator tests after the repository replacement.
- The Vite+ research and existing configuration establish the toolchain command style, but the clean application candidate must prove the final dependency graph, build, tests, packaging, signature, metadata, and launch before plugin-owned files are removed.

## Out of Scope

- Network requests, cloud synchronization, remote databases, accounts, authentication, multi-user collaboration, analytics, remote error reporting, and hosted reference data.
- Alternate invoice layouts, themes, arbitrary styling, user templates, a drag-and-drop document designer, or multiple issuer identities.
- Multiple service lines, hourly billing, expenses, mixed rates, or optional commercial fields absent from the fixed reference layout. Legally required issuer, client, tax-point, VAT, and currency-conversion facts remain in scope.
- Partial credit notes, debit notes, supplementary invoices, editing issued documents, deleting issued documents, or a general action to void an issued invoice.
- Payment status, delivery status, debt collection, bad-debt accounting, reminders, or bookkeeping integrations.
- Dashboards, analytics, a guided onboarding wizard, and a saved-draft collection.
- A selectable live-data directory, scheduled backup, cloud backup, incremental backup, backup merging, application-level encryption, transaction journals, automatic rollback, or a general repair subsystem.
- Fetching exchange rates, validating company registration, validating VAT registration ownership, validating bank-account ownership, or giving tax advice.
- Intel Mac, universal binary, Rosetta-only, Windows, Linux, package installer, ZIP distribution, Mac App Store, Developer ID signing, notarization, hardened runtime, or DMG signing.
- Release CI, hosted downloads, GitHub Releases, an update feed, update checks, automatic downloads, or an automatic updater.
- Formal WCAG conformance, Axe checks, VoiceOver checks, screen-reader accessible-name assertions, or screen-reader announcements. Keyboard order, visible feedback, validation focus, dialog focus containment, Escape behavior, and focus restoration remain required functional behavior. React Doctor's default accessibility diagnostics remain enabled as part of the requested static quality gate, but they do not create a separate formal accessibility acceptance programme.
- Production use of prototype controls, sample data, variant switchers, or rejected prototype layouts.

## Further Notes

- The domain glossary is authoritative for terms such as Issuer, Client, Invoice draft, Issue, Issued invoice, Credit note, Fully credited invoice, Replacement invoice, Invoice ID, Invoice prefix, Invoice number, VAT treatment, Exchange record, and Invoice layout. Implementation and tests must use those terms rather than the listed avoided synonyms.
- The Wayfinder decision map and its resolved tickets are the source for rationale. This specification is the self-contained implementation contract. If a future ticket appears to conflict with a linked decision, resolve the conflict before changing code.
- The UK VAT research records the source material behind overseas place-of-supply treatment, sequential numbering, foreign-currency VAT presentation, immutable records, and linked corrections. Recheck primary HMRC guidance before changing those rules in a later release.
- The toolchain research records exact dependency metadata, compatibility reasoning, candidate-generation procedure, Vite+ ownership rules, and package-verification commands. Use its pinned versions for the initial scaffold rather than floating package tags.
- Playwright 1.62.1 and `@playwright/test` 1.62.1 were added to the toolchain decision from current npm registry metadata on 3 September 2026 because the acceptance ticket made real Electron journey automation necessary after the original toolchain research.
- Fallow 3.22.0 and React Doctor 0.9.13 were added from current npm registry metadata on 3 September 2026. Fallow's documentation confirms that `electron` and `vite` independently activate its built-in Electron and Vite plugins. Anti-slop's upstream instructions require vendoring its source into the repository and loading it as an Oxlint JavaScript plugin through the Vite+ lint configuration.
- The supplied Codernetic invoice PDF is the only visual layout authority. The generated representative invoice and full credit note are verification evidence, not alternate templates.
- The repository currently has no product implementation and no committed baseline. Preserve unrelated and planning content during replacement. Do not stage or commit on `main`; obtain the exact implementation branch name first.
