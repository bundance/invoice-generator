# Harness observability

Start with the command output. The release runner prints `START <stage>` and `PASS <stage>` markers, stops at the first failing stage, and prints the final artifact SHA-256 only after every automated stage passes. [`run-release-gate.ts`](../../src/infrastructure/release-gate/run-release-gate.ts) defines that contract.

## Evidence locations

| Evidence                              | Location                                               | Lifetime                                                                                                              |
| ------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Vitest and Playwright machine results | `test-results/`                                        | Working evidence. The full gate removes and recreates this directory, and clears intermediate results as it advances. |
| Failed Electron journey evidence      | Under the failing Playwright output in `test-results/` | Retained on failure or a blocked network request. Removed after a clean journey.                                      |
| Packaged release candidate            | `release/`                                             | Retained until the next package run replaces the directory.                                                           |
| Live verifier evidence                | `.codex/pstack-state/verify-invoice-generator/`        | Retained after the verifier stops.                                                                                    |

A failed Electron journey can retain:

- `failure-manifest.json`, which lists the failure status, blocked network requests, and copied isolated datasets;
- `main-process.stdout.log` and `main-process.stderr.log`;
- `renderer.log` and `network-requests.log` for each launch;
- final-window screenshots and Playwright failure screenshots;
- `trace.zip`;
- `isolated-datasets/` containing the journey's disposable user data.

The retention policy is implemented by [`electron-test-app.ts`](../../tests/e2e/support/electron-test-app.ts), checked by [`check-evidence-retention.ts`](../../src/infrastructure/release-gate/check-evidence-retention.ts), and paired with Playwright's failure trace and screenshot settings in [`playwright.config.ts`](../../playwright.config.ts).

## Reading a failure

Use this order so a secondary evidence error does not hide the original problem:

1. Read the release runner's first failed stage and process exit or signal.
2. If Electron never launched and the output contains `EPERM` or `SIGABRT`, rerun with normal macOS GUI process access.
3. Open `failure-manifest.json`. It says whether the journey failed, timed out, was interrupted, or attempted network access.
4. Read `main-process.stderr.log`, then `main-process.stdout.log`, then `renderer.log`.
5. Check `network-requests.log`. Production Electron blocks HTTP, HTTPS, WebSocket, and secure WebSocket requests. Any entry fails the offline contract in [`main.ts`](../../src/infrastructure/electron/main.ts).
6. Inspect the last screenshot. Open `trace.zip` when timing, focus, navigation, or the sequence of actions is unclear.
7. Inspect `isolated-datasets/` only when durable state or retained PDFs are relevant.

For PDF-stage failures, use the named `pdfinfo`, selectable-text, embedded-font, wordmark, size, or pixel comparison error from [`retained-pdf-verification.ts`](../../tests/e2e/support/retained-pdf-verification.ts). For package-stage failures, use the first failed contract from [`inspect-package.ts`](../../src/infrastructure/release-gate/inspect-package.ts). A passing gate writes `release/release-candidate.json` and `release/acceptance-report.json`; the latter is the source for the exact DMG path, SHA-256, passed checks, and pending human approvals.

## Production and test diagnostics

Keep production data separate from harness evidence.

- Production uses Electron's `app.getPath("userData")` for `state.json` and retained PDFs. These are customer records, not diagnostic artifacts. The application does not create a durable production log bundle.
- Automated Electron journeys pass a disposable `--user-data-dir`, record process and renderer output, and enable fault and network instrumentation through test-only environment variables.
- The live verifier also uses disposable local data. Its evidence is useful for visible UI checks, but it does not replace `timeout 900 vp run validate`.

When an installed build fails, first record the visible recovery state and the exact app and macOS versions. Preserve the production dataset in place. Reproduce with the live verifier or an isolated copy only after the owner authorizes handling real data. Never point automated tests at the production user-data directory.

## Privacy and retention

Harness artifacts are git-ignored, not automatically private or encrypted. Failure and verifier evidence may contain client names, addresses, bank details, invoice contents, screenshots, workspace state, retained PDFs, and a full isolated dataset. Use synthetic data. Review evidence before sharing, and never publish it with a pull request or upload it to a third-party service by default.

Successful Electron journeys delete their temporary datasets and journey evidence. Failed journeys retain evidence for diagnosis; remove it after the failure is resolved. Live-verifier evidence remains until someone deletes it. Release evidence remains until the next package run replaces `release/`; preserve an accepted DMG together with its matching report and SHA-256.
