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

The bounded `start` command and direct helper commands are pre-approved in the user's Codex execution policy. Launch Electron outside the sandbox on the first attempt, as required by `AGENTS.md`; the matching saved rule should approve that launch automatically. Keep browser actions inside the repository helper.

Codex's `write_stdin_approval` check reviews nonempty input sent to an escalated terminal separately from its launch. A saved launch rule does not cover later terminal input. The approval's network-proxy wording describes the terminal's launch permissions; it does not establish that an external network request occurred. Use the standalone helper commands below for routine verification instead of the interactive `session` workflow. Keep the global terminal-input approval check enabled.

Invoke action commands exactly as shown with default execution permissions, without an outer timeout or shell wrapper. The existing saved rules authorize those calls. The helper already bounds browser calls with `timeout 60` and bounds its connection and cleanup operations. An extra wrapper changes the command matched by the saved rule.

If a documented verifier command is unexpectedly blocked by the execution policy, report the exact unmatched command and request one narrow policy correction. Do not turn individual UI actions into separate escalated shell calls.

## Launch and connect

```bash
timeout 1200 .agents/skills/verify-invoice-generator/scripts/verify-electron.sh start
```

Run `start` with `exec_command` using `tty: false` and `sandbox_permissions: "require_escalated"`. Keep the returned terminal `session_id` until cleanup. Batch mode avoids the stopped-build behavior observed with a foreground PTY. The outer timeout bounds the Electron process; the helper builds the app, checks `agent-browser`, creates disposable user data, and starts production Electron.

Poll launch output with empty `write_stdin` input when needed. Empty polls do not send commands to the terminal. After the helper prints `Electron starting`, connect in a separate execution call:

```bash
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh connect
```

Wait for this ready message before driving the app:

```text
Verification app ready. Evidence: ...
```

`connect` waits for the local CDP endpoint, connects the worktree-scoped browser session, and captures the launch state. Run subsequent commands as separate direct helper calls; do not send them to the launch process's stdin.

## Target and drive

Run these commands sequentially in separate execution calls:

```bash
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh doctor
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh browser snapshot -i
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh browser find role button click --name Settings
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh browser snapshot -i
```

Wait for each command to finish and check its exit status before the next action. Run `doctor` before the first interaction and after any failed or surprising action. Re-snapshot after navigation, a dialog, or a React update because element refs become stale.

Use visible controls and accessible names. Do not call the preload bridge with `eval` to bypass the UI. The Playwright journeys under `tests/e2e/` remain the automated product gate; use this skill for user-visible evidence and exploratory checks.

## Capture evidence

Capture each meaningful state with a short lowercase label:

```bash
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh capture settings-saved
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh audit invoices-accessibility
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh evidence
```

`capture` writes a snapshot, screenshot, tab list, and browser errors into the run's evidence directory. `audit` saves a WCAG A and AA accessibility report. Inspect screenshots when layout, clipping, dialogs, focus, or document preview matters. Copy acceptance evidence into the active repository's `release/` directory before handoff, as required by `AGENTS.md`. Evidence stays after cleanup.

## Failure handling

- If launch or connection fails, inspect `electron.stdout.log` and `electron.stderr.log` in the evidence directory when available. Run the helper's `stop` command to clean up a recorded run.
- If `doctor` fails, stop driving. Capture the failure if CDP still responds, then run `stop`.
- If the UI is wedged while the process is healthy, capture it, stop the run, and start a fresh run. Do not keep interacting with an unknown state.
- Treat missing setup data as a reachable product state. Complete issuer and client setup through the UI or start a fresh run for a different recipe.
- Run `timeout 900 vp run validate` when the task requires the full automated release gate. A live pass does not replace it.

## Cleanup

```bash
.agents/skills/verify-invoice-generator/scripts/verify-electron.sh stop
```

Run `stop` after every pass, including failed or interrupted passes. It closes the named browser session, terminates only the Electron process owned by the recorded run, and removes only the disposable user-data directory it created. It preserves the evidence directory. Poll the launch process with empty input to confirm it has exited. The standalone workflow requires explicit cleanup; the outer launch timeout alone does not remove the disposable data or run record.

The interactive `session` subcommand remains available for diagnosing that wrapper. Its stdin workflow can trigger approvals on escalated terminals, so it is not the routine verification path.
