# 26 — Complete the local release gate

**What to build:** Turn the finished application into one locally verifiable arm64 DMG whose automated and human evidence proves the complete specification without hidden retries or network dependence.

**Blocked by:** 17 — Preserve invoice state across issue failures; 19 — Issue a foreign-currency UK VAT invoice; 20 — Lock used client identities and preserve history; 22 — Create and issue a linked replacement; 24 — Recover from unreadable or unsupported state; 25 — Prove fixed-layout PDF fidelity.

**Status:** complete

- [x] The authoritative validation command runs the shared quality gate, domain and persistence tests, React tests, production build, Playwright Electron journeys, PDF verification, DMG packaging, and automated package inspection in the specified order.
- [x] Every specification requirement maps to a named automated check or explicitly human-only check, and the complete fixture, boundary, lifecycle, failure-injection, keyboard, security, persistence, correction, backup, recovery, and zero-network matrices pass.
- [x] The accepted run contains no failed, skipped, pending, quarantined, or retried test; successful runs remove temporary evidence, while failed Electron journeys retain their isolated dataset, traces, screenshots, renderer logs, and main-process logs.
- [x] Package inspection proves the stable application identity, macOS 26 minimum, arm64-only application, ad hoc app signature, disabled hardened runtime, lack of notarization, unsigned drag-to-Applications DMG, expected contents, and absence of update, publishing, alternate-platform, and forbidden runtime metadata.
- [x] Installing the exact release candidate through Gatekeeper Open Anyway preserves an existing dataset, launches successfully, refuses a newer unsupported dataset, and passes the representative invoice and credit-note visual review.
- [x] The final named-check report records every automated stage and required human approval as passed for the same release candidate artifact.

## Current-main acceptance

Base commit: `b870a28c3eedd82af804fedf5381ad323d0ad3f1`

Release candidate: `release/Invoice Generator-0.1.0-arm64.dmg`

Release candidate SHA-256: `be68451868214a25a96880e174409ba6f82c7fa4b56cbabded9be51df1f21034`

Automated report: `release/acceptance-report.json`

Exact-artifact evidence: `release/exact-artifact-evidence/20260913T174434Z`

Final named-check report: `release/final-acceptance-report.json`

The final report was generated at `2026-09-13T20:31:04.028Z`. It records 8 passed stages, 28 passed automated checks, 9 passed Electron scenario groups, 411 accepted test records, 100 mapped requirements, 21 mapped specification sections, and 5 passed human approvals for the release candidate above.

- [x] `human-gatekeeper-install`: Mike supplied `PASS` for this exact release candidate.
- [x] `human-existing-dataset-launch`: Mike supplied `PASS` for this exact release candidate.
- [x] `human-newer-dataset-refusal`: Mike supplied `PASS` for this exact release candidate.
- [x] `human-invoice-output-approval`: Mike supplied `PASS` for this exact release candidate.
- [x] `human-credit-note-output-approval`: Mike supplied `PASS` for this exact release candidate.

## Prior accepted candidate

The earlier acceptance evidence remains associated with SHA-256 `a4ab3f3211a2e0870b7dac165b771896735c39cc1923ec155cf939a0e9668f7c`. None of its approval records were reused for the current-main candidate.
