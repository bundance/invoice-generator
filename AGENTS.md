<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Project Vite+ runtime

- Run full validation as `timeout 900 vp run validate`. Vite+ resolves the Node.js version from `.node-version`; a different result from standalone `node --version` does not require an override.
- Use `vp env exec --node <version> ...` only when `vp env doctor` or a failed `vp` command proves that automatic runtime resolution is incorrect.

## Artifact locations

- Never create user-facing scripts, reports, plans, handoff artifacts, or
  acceptance evidence under `/tmp`, `/private/tmp`, or `$TMPDIR`.
- Put release artifacts and acceptance evidence under the active repository's
  ignored `release/` directory.
- Put other disposable task artifacts under the active repository's ignored
  `.scratch/` directory.
- Use operating-system temporary directories only for caches and intermediate
  files that the user will never need to execute, inspect, or retain.
- Before editing, confirm that the target is inside the active repository or
  managed worktree. If it is not, resolve the correct workspace instead of
  defaulting to a temporary path.

## Live application verification

Always read and run `.agents/skills/verify-invoice-generator/SKILL.md` before completing any task that changes or verifies application behavior. This live run supplements the automated checks; it does not replace them.

Always run `vp run check:quality` and fix any errors and warning that are raised after completing any task that changes application code. Do not do this for documentation.
