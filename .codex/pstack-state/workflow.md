# Source-layout refactor workflow

## Definition of done

The refactor is complete only when all of these predicates hold:

1. Production source has four clear owners under `src`: `domain`, `application`, `infrastructure`, and `renderer`.
2. No business module, renderer module, stylesheet, or ambient declaration remains directly under `src`.
3. The old `electron`, `src/components`, `src/pages`, `src/lib`, and `src/test` paths are gone, with no compatibility re-exports or duplicate paths.
4. Domain schemas remain beside the business rules they enforce. No generic `schemas` or `utils` folder is introduced.
5. The application contract does not contain Electron channel names. Electron transport owns those names.
6. Every import resolves, type-aware checks pass, all unit and renderer tests pass, the production Electron journeys pass, and the arm64 package gate passes through `timeout 900 vp run validate`.
7. The final diff changes structure and imports only, except for the agreed split of mixed-owner files. Runtime behavior and persisted data shapes remain unchanged.

## Scope and rigor

- Scope: 67 TypeScript, TSX, and CSS files, about 9,086 lines, with 54 files containing relative imports.
- Expected work: six independently checked migration units plus baseline and final validation.
- Main risks: broken `.js` Electron imports after moves, Vite entrypoint drift, accidental type-contract changes while splitting `app-api.ts`, CSS cascade changes, and test discovery drift.
- Blockers: none found. The branch is `IG-0005-build-recoverable-outside-scope-draft`, not `main`, and was clean before work began.
- Rigor: high. The changes are reversible but cross every runtime tier. Existing unit, jsdom, real Electron, and packaging checks form the behavior pin.

## Workflow

1. Run the complete validation command before editing and record the result.
2. Move domain modules as one unit, update every caller, and run focused domain tests plus type-aware checks.
3. Move the application service and persistence/Electron adapters. Split application contract types from IPC channel names. Run main-process tests and Electron foundation tests.
4. Move renderer files by product owner. Keep `App` for composition and preserve component identities. Run renderer tests and type-aware checks.
5. Split the stylesheet by copying declarations unchanged into owner-specific files imported by one renderer stylesheet entrypoint. Run renderer tests and build.
6. Move test fixtures and end-to-end support, update test discovery, and run the affected Electron journeys.
7. Prove that no legacy paths or duplicate interfaces remain. Inspect the final tree and diff.
8. Run `timeout 900 vp run validate` against the real Electron application and package.
9. Review the finished code with `simplify`, audit the decision trail, and obtain a fresh cross-model review of the trail.

The architecture arena is intentionally skipped. The user reviewed the target layout in the previous turn, and this run is implementing that settled design rather than reopening it.
