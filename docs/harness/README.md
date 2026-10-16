# Harness execution

Run harness commands from the repository root. The supported package manager is the Vite+ `vp` command backed by the pinned pnpm version in [`package.json`](../../package.json). Keep `pnpm-lock.yaml` frozen during setup.

Use `vp install`, `vp add`, and `vp remove` for dependency work. Do not substitute direct `npm` or `pnpm` commands; that bypasses the repository's Vite+ runtime and package-manager contract.

Package scripts use the Node.js version in [`.node-version`](../../.node-version) through Vite+ managed mode. If `vp env doctor` reports system-first mode, run `vp env on` before setup or validation.

## Commands

| Job                | Command                                                       | Writes generated output                                 |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------- |
| Setup              | `CI=true timeout 300 vp install --frozen-lockfile`            | Hydrates `node_modules/` and installs repository hooks  |
| Fast quality       | `timeout 300 vp run check:quality`                            | No product or release artifacts                         |
| Routine test suite | `timeout 300 vp run test`                                     | No release artifacts; tests use disposable fixtures     |
| Focused tests      | `timeout 300 vp test run <paths> --allowOnly=false --retry=0` | No release artifacts; tests use disposable fixtures     |
| Full release gate  | `timeout 900 vp run validate`                                 | Rebuilds test, application, package, and release output |

The full gate is the authoritative result. Its stages and time limits live in [`release-plan.ts`](../../src/infrastructure/release-gate/release-plan.ts). It runs quality checks, unit and component tests, the production build, Electron journeys, PDF checks, arm64 DMG packaging, and package inspection.

PDF.js brings an optional native canvas dependency into the packaged dependency tree. Package inspection includes `.node` addons even when they lack executable permissions. Platform detection checks path segments so the target `canvas-darwin-arm64` package is accepted while alternate platform packages remain blocked.

The release runner always starts stages in batch mode with `CI=true` and no standard input. Output remains visible in the terminal. This prevents interactive tools such as React Doctor from suspending under the stage timeout wrappers; callers do not need extra environment variables or input redirection.

The `check:quality` script also sets `CI=true` for React Doctor so direct quality runs finish without keyboard input before continuing to Fallow.

## Electron permission boundary

Run the full gate with normal macOS GUI process access, outside a restricted command sandbox. Electron launch can abort with `EPERM` or `SIGABRT` in a sandbox, and the evidence check may then report a secondary error about a missing screenshot. That is an execution-environment failure, not proof of an application defect.

The same boundary applies to direct Electron tests and the live verifier. The verifier's approved command and evidence workflow are documented in [`verify-invoice-generator`](../../.agents/skills/verify-invoice-generator/SKILL.md).

## Generated output

The quick quality and Vitest commands are the ordinary edit loop. The full gate is artifact-writing and destructive to ignored output directories:

- [`run-release-gate.ts`](../../src/infrastructure/release-gate/run-release-gate.ts) removes and recreates `test-results/`.
- [`package-mac.ts`](../../src/infrastructure/release-gate/package-mac.ts) removes and recreates `release/`.
- The build replaces generated content under `dist/` and `dist-electron/`.
- A passing gate prints `LOCAL RELEASE GATE PASSED`, the artifact SHA-256, and the acceptance-report path. It leaves the arm64 DMG, `release/release-candidate.json`, and `release/acceptance-report.json` under `release/`. The report leaves human approvals pending.

Do not run the full gate while another process depends on those generated directories. None of these commands should read or modify the installed application's production dataset. Test code creates isolated user-data directories; see [`electron-test-app.ts`](../../tests/e2e/support/electron-test-app.ts).

## Failure route

1. Use the first failing stage printed by the command. Later stages have not run.
2. For setup or Node errors, run `timeout 30 vp run check:runtime` and confirm it reports the version pinned by `.node-version` and `package.json`.
3. For quality or Vitest failures, fix the named check or test and rerun the smallest command above.
4. For Electron launch failures containing `EPERM`, `SIGABRT`, or a missing failure screenshot, rerun outside the sandbox before diagnosing product code.
5. For a launched Electron journey that fails, follow [`observability.md`](observability.md) and inspect its retained evidence.
6. For package inspection failures, inspect the last package-stage error plus `release/release-candidate.json` when it exists. A partial or failed run is not a release candidate.

## Mobile smoke

Mobile smoke testing is not applicable. This repository builds a macOS arm64 Electron DMG only, as defined by [`electron-builder.yml`](../../electron-builder.yml). It has no iOS, Android, React Native, or Expo target.
