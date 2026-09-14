# 11 — Establish the validated application foundation

**What to build:** Replace the plugin-development checkout with the smallest clean Vite+ React TypeScript Electron application foundation, and make its quality gate mandatory before any product feature is committed.

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] Build and validate the clean application candidate in a fresh temporary directory, then apply a reviewed file-by-file replacement that preserves the product documents, glossary, Wayfinder decisions, specification, and prototype evidence without copying a hydrated dependency directory.
- [x] Pin the approved Node, pnpm, Electron, React, TypeScript, Vite+, Vite, Vitest, Playwright, and packaging dependencies; pin Fallow 3.22.0 and React Doctor 0.9.13 as development dependencies.
- [x] Vendor anti-slop from a recorded upstream revision, match `@oxlint/plugins` exactly to the resolved Oxlint version, and enable every generic anti-slop rule as an error in Vite+'s lint configuration alongside the other relevant correctness rules.
- [x] Provide one `check:quality` task that runs `vp check`, a full React Doctor scan with warnings blocking, and a full Fallow scan with findings blocking; React Doctor score upload and telemetry are disabled, while no diagnostic rule or category is disabled to obtain a pass.
- [x] Verify that Fallow reports its built-in Electron and Vite plugins active from the existing `electron` and `vite` dependencies. Do not add `electron-vite` merely for detection, and do not enable anti-slop's Effect rules while the application does not use Effect.
- [x] Install a pre-commit hook that runs `check:quality`, and make the authoritative validation task begin with the same quality task so the first and every later implementation commit must pass it.
- [x] Prove the minimal renderer starts, the production build succeeds, the arm64 DMG can be produced, all quality checks pass with zero blocking findings, and the exact user-approved non-`main` implementation branch is active before the first commit.
