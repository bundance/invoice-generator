# Define the validation and acceptance contract

Type: grilling
Status: resolved
Blocked by: 02, 04, 06, 07, 09

## Question

Which automated checks and user-visible scenarios must pass before implementation can be called complete, including calculations, persistence recovery, invoice sequences, full-credit correction chains, VAT treatments, visual PDF fidelity, destination empty states, keyboard-only flow and focus restoration, accessible names and announcements, validation and autosave feedback, and every recoverable error path exposed by the approved Document studio experience?

## Answer

Implementation is complete only when the single automated command `vp run validate` passes and the applicable human checks are signed off. Do not use a percentage-based code-coverage target. Instead, map every requirement in the product and architecture specification to a named automated check or an explicitly human-only check.

### Automated gate

`vp run validate` runs these release-blocking stages in order:

1. `vp check` for formatting, linting, and type checking.
2. Domain, persistence, and React interaction tests.
3. A production build of the renderer, preload, and Electron main process.
4. Playwright scenarios against that production Electron build.
5. PDF structure, fit, text, asset, and raster-baseline verification through the real Electron renderer.
6. The arm64 DMG build and automated checks of its architecture, minimum macOS version, ad hoc application signature, unsigned DMG boundary, contents, and absence of publishing or update artifacts.

Every stage must pass. The accepted run has no failed, skipped, pending, quarantined, or retried test. A pass after retry is not acceptance. Validation must never update snapshots or visual baselines as a side effect.

### Quality-analysis amendment

The first implementation commit must establish a shared `check:quality` task and a pre-commit hook that runs it. The task runs `vp check`, a full React Doctor scan with warnings blocking, and a full Fallow scan with findings blocking. The authoritative `vp run validate` command begins with that same task.

Vite+'s Oxlint configuration must load a vendored copy of anti-slop from a recorded upstream revision and enable every generic anti-slop rule as an error, alongside the other relevant Vite+ lint rules. Pin `@oxlint/plugins` to the resolved Oxlint version. Do not enable anti-slop's optional Effect rules unless the application directly adopts Effect.

Pin Fallow and React Doctor rather than invoking floating package tags. Fallow must report its built-in Electron and Vite plugins active from the approved `electron` and `vite` dependencies; do not add `electron-vite` for detection. React Doctor must run against the full project with no rule or category disabled to obtain a pass, with score upload and telemetry disabled. Its default accessibility diagnostics remain part of this static quality gate, without adding WCAG, Axe, VoiceOver, or screen-reader acceptance checks.

Tests use deterministic fixtures, a fixed clock, a fixed IANA business timezone, and a fresh temporary Electron application-data directory per scenario. Faults are injected through test-owned process boundaries rather than production UI controls. The production build must not expose the fault controls.

### Domain and persistence coverage

Fast domain tests cover the full rule matrix without importing Electron:

- currencies with zero, two, and three minor-unit digits;
- half-up rounding boundaries for client-currency net and VAT and for the independent sterling summary;
- GBP UK-taxable invoices;
- foreign-currency UK-taxable invoices with a complete exchange record and sterling totals;
- outside-scope invoices with and without reverse-charge wording;
- every normalization, identifier, date, quantity, rate, VAT, exchange, text-limit, and renderer-fit boundary from [Specify calculation and form-validation rules](09-specify-calculation-and-form-validation-rules.md);
- first and custom starting numbers, independent client sequences, growth from four to five displayed digits, consumed numbers, retained voids, and uniqueness across the dataset;
- one full credit, an optional replacement, and repeated credit-and-replacement chains;
- exact negation of the original stored client-currency and sterling values without recalculation.

Persistence tests exercise valid and invalid `schemaVersion: 1` data, an unknown newer version, malformed JSON, schema-invalid data, referenced-PDF consistency, temporary files, unreferenced prepared PDFs, atomic state replacement, whole-dataset backup, and replacement restore. A failed conversion or restore leaves the prior dataset unchanged. An accepted restore contains exactly the selected state and referenced PDFs, with no merge.

Inject failure into draft writes, PDF generation, PDF verification, retained-PDF writes, state temporary writes, state validation, atomic rename, backup creation, archive validation, restore preparation, and restored-state commit. Before the durable issue commit, failure preserves the draft and next number. After the commit, failure never removes or edits the issued snapshot, retained PDF, or consumed number. Startup cleanup may remove only unreferenced temporary files or prepared PDFs.

### Real Electron scenarios

Playwright launches the production Electron build, controls the real renderer and main-process boundaries, and uses an isolated dataset for each scenario. These journeys are required:

1. Fresh launch shows all four empty destinations, then permits issuer setup and first-client creation. New Invoice shows a setup-required Document studio state linked to issuer settings and client creation. Invoices links to New Invoice, Clients offers `Create first client`, and Settings shows empty issuer and bank forms plus backup and restore. Do not add a dashboard or onboarding wizard.
2. Draft editing updates the live preview, survives destination changes, autosaves, recovers after restart, and can be discarded without consuming a number.
3. An invalid issue attempt shows field messages and a linked error summary, focuses the summary, permits every error to be fixed, handles the tax-point warning acknowledgement, opens the final confirmation only for a current valid candidate, permits cancellation, and restores focus to the trigger.
4. An outside-scope invoice issues successfully, including the variant with explicit reverse-charge wording.
5. A foreign-currency UK-taxable invoice issues with exchange evidence and the statutory sterling summary.
6. Each PDF and durable-state failure produces the correct visible error and proves the pre-commit or post-commit guarantees above.
7. A full credit note preserves the original, handles an existing-draft conflict without overwriting it, creates an optional unnumbered replacement draft, and supports a second credit-and-replacement link.
8. Backup creation, invalid archive rejection, cancelled restore, successful whole-dataset replacement, unreadable state, missing referenced data, and a newer unsupported schema all preserve data and present the approved recovery path.
9. History search, retained-PDF open and export, locked client prefixes, and later client or issuer edits all preserve issued records and exact historical PDFs.

The domain suite owns exhaustive value permutations. The Electron suite uses representative values and proves the real UI, preload, IPC, filesystem, and lifecycle connections rather than repeating the full cross-product.

### Feedback, keyboard, and focus

Draft feedback has visible `Saving`, `Saved on this Mac`, and persistent `Could not save draft` states. A failed save keeps the current in-memory edits and offers Retry. An issue attempt retries the current draft save first. If saving still fails, the confirmation stays closed and no PDF, historical record, or number is committed.

All functionality used by the acceptance journeys works with the keyboard. Tab order follows navigation, the active form section, preview controls, and issue actions. Issue, credit-note, and restore confirmations contain focus while open, close on Escape, and restore focus to their triggering controls. Validation focus behavior follows the scenario above.

Formal accessibility is outside this acceptance contract because this internal application has one user who does not need accessibility features. Do not add WCAG conformance, Axe, VoiceOver, screen-reader accessible-name assertions, or screen-reader announcement checks. Use native HTML controls where they are the simplest implementation, but their assistive-technology behavior is not a release gate.

### PDF acceptance

Automated PDF checks use the approved representative invoice and full-credit-note fixtures and enforce the contract in [Prove the PDF rendering approach](07-prove-the-pdf-rendering-approach.md): identifier-only filenames, one A4 page, tagged selectable required text, embedded fonts, exact wordmark pixels, zero measured overflow, rejection of a deliberate overflow case, and successful fixed-DPI rasterization.

Create the approved raster baselines in the pinned Electron environment. Render each candidate three times, find the smallest comparison tolerance that accepts those identical repeat renders, document it, and freeze the renderer, fonts, scale, DPI, and baselines. Any difference beyond that tolerance requires human review and a deliberate baseline update. Raw PDF bytes are not compared.

### Electron, offline, and packaging boundaries

Automated checks prove that renderer sandboxing and context isolation are enabled, Node integration is disabled, the preload exposes only the typed invoice API, and every IPC handler validates its sender and input. Unexpected navigation, new windows, and external URLs are rejected. No acceptance journey may make a network request. A second application instance cannot become another dataset writer.

The final packaged check builds only the agreed Apple Silicon DMG. It verifies the application binary is arm64, the minimum system version is macOS 26.0, the application has a valid ad hoc signature, hardened runtime and notarization are absent, the DMG itself is unsigned, and no updater, publish metadata, alternate architecture, or extra platform artifact is present.

### Human checks and evidence

The final release candidate requires a human to drag the app from the DMG into Applications, complete the expected Gatekeeper `Open Anyway` flow, launch the installed app, and approve the representative invoice and credit-note raster renders against the reference and accepted baselines. Repeat the relevant human checks after any packaging or shared-document-renderer change; logic-only changes need only the automated gate.

Successful automated runs produce a concise report naming every passed stage and scenario. Failed Playwright scenarios retain their trace, screenshots, renderer logs, main-process logs, and isolated dataset. Successful scenarios remove those temporary artifacts. The release record retains the signed-off human checklist and any deliberately approved baseline change.
