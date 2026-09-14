---
name: verify-invoice-generator
description: Drive the production Invoice Generator Electron app with disposable local data and capture user-visible evidence. Use for live UI verification, feature-map maintenance, accessibility checks, or reproducing renderer behavior outside Playwright.
---

# Verify Invoice Generator

Use one production Electron instance for the whole verification pass. The helper builds the app, starts it with disposable user data, exposes a private CDP port, connects a worktree-scoped `agent-browser` session, and records evidence under `.codex/pstack-state/verify-invoice-generator/`.

Read [features/README.md](features/README.md) before a feature-wide pass. Read only the feature files needed for a focused check.

## Check the tools

From the repository root, run:

```bash
timeout 60 agent-browser --version
timeout 60 agent-browser skills get core
timeout 60 agent-browser skills get electron
timeout 60 vp --version
```

If `agent-browser` is absent, show this command and wait for approval:

```bash
npm install -g agent-browser && agent-browser install
```

## Approval behavior

The repository verifier and its bounded `session` command are pre-approved in the user's Codex execution policy. The session writes disposable state outside the file sandbox and launches Electron, so request outside-sandbox execution for the launch command on the first attempt. The stored rule should grant it without asking the user. Do not ask for a new approval for each browser action or replace the helper with direct Electron, CDP, or `agent-browser` launches.

If a documented verifier command is unexpectedly blocked by the execution policy, report the exact unmatched command and request one narrow policy correction. Do not turn individual UI actions into separate escalated shell calls.

## Launch a verification session

```bash
timeout 1200 .agents/skills/verify-invoice-generator/scripts/verify-electron.sh session
```

Run `session` in a long-lived terminal or PTY and keep its returned process open. The outer timeout bounds the whole live session. It builds the app, checks `agent-browser`, creates disposable user data, starts production Electron, connects the worktree-scoped browser session, and captures the launch state.

Wait for this ready message before driving the app:

```text
Verification session ready. Send one tab-delimited command per line; send 'stop' to finish.
```

The session stays inside the original approved process. Send subsequent commands to its stdin instead of starting new shell commands. Each input line contains the helper command and its arguments separated by actual tab characters. Spaces inside an argument are preserved; do not type the text `<TAB>`.

## Target and drive

Send commands such as these to the session process:

```text
doctor
browser<TAB>snapshot<TAB>-i
browser<TAB>find<TAB>role<TAB>button<TAB>click<TAB>--name<TAB>Settings
browser<TAB>snapshot<TAB>-i
```

Use the terminal stdin writer to send actual tabs. Wait for `verification-command-complete` or `verification-command-failed:<status>` before sending the next command. Run `doctor` before the first interaction and after any failed or surprising action. Re-snapshot after navigation, a dialog, or a React update because element refs become stale.

Use visible controls and accessible names. Do not call the preload bridge with `eval` to bypass the UI. The Playwright journeys under `tests/e2e/` remain the automated product gate; use this skill for user-visible evidence and exploratory checks.

## Capture evidence

Capture each meaningful state by sending a short lowercase label:

```text
capture<TAB>settings-saved
audit<TAB>invoices-accessibility
evidence
```

`capture` writes a snapshot, screenshot, tab list, and browser errors into the run's evidence directory. `audit` saves a WCAG A and AA accessibility report. Inspect screenshots when layout, clipping, dialogs, focus, or document preview matters. Evidence stays after cleanup.

## Failure handling

- If launch fails, inspect `electron.stdout.log` and `electron.stderr.log` in the evidence directory. The session cleans up automatically before it exits.
- If the session cannot reach CDP, inspect the logs in the recorded evidence directory.
- If `doctor` fails, stop driving. Capture the failure if CDP still responds, then run `stop`.
- If the UI is wedged while the process is healthy, capture it, stop the run, and start a fresh run. Do not keep interacting with an unknown state.
- Treat missing setup data as a reachable product state. Complete issuer and client setup through the UI or start a fresh run for a different recipe.
- Run `timeout 900 vp run validate` when the task requires the full automated release gate. A live pass does not replace it.

## Cleanup

```text
stop
```

Send `stop` to the session process. It closes the named browser session, terminates only the Electron process owned by the session, and removes only the disposable user-data directory it created. It preserves the evidence directory. Cleanup also runs if stdin closes, a command fails fatally, the outer timeout expires, or the session is interrupted.

The standalone `start`, `connect`, and `stop` subcommands remain available for diagnosing the session wrapper itself. Do not use them for an ordinary verification pass.
