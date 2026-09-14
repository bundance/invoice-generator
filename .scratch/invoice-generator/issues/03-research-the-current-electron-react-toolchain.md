# Research the current Electron and React toolchain

Type: research
Status: resolved
Blocked by: none

## Question

What exact current, mutually compatible setup should this app use for Electron, React, TypeScript, shadcn, Tailwind, Vite+, vite-plugin-electron, Oxlint, Oxfmt, testing, and packaging, and how should the current plugin-repository checkout be replaced with a real application scaffold?

## Answer

The cited research is recorded in [`docs/research/electron-react-toolchain.md`](../../../docs/research/electron-react-toolchain.md). Its version snapshot was checked on 3 September 2026.

- Start with pinned Node 24 and pnpm 11 runtimes, Electron 44, React 19.2, TypeScript 7, Vite+ 0.3, `vite-plugin-electron` 1.1, Tailwind 4.3, shadcn 4.20, and electron-builder 26. Keep the exact patches and lockfile recorded in the research rather than floating on `latest`.
- Declare `vite` directly and alias it to the matching `@voidzero-dev/vite-plus-core` 0.3 release. Keep Vite+'s exact Vitest pin where the testing dependencies require its peer. Vite+ owns Vitest, Oxlint, Oxfmt, and type-aware checking; configure them together in `vite.config.ts`.
- Use `vite-plugin-electron/simple` for main and preload builds. Keep Node out of the renderer, expose narrow typed APIs through `contextBridge`, and retain Electron's context isolation and renderer sandbox.
- Test domain logic in a Node environment and React components in jsdom. Require a real packaged-app smoke check, but add no separate end-to-end framework until a flow needs it.
- Produce only the agreed arm64 DMG. electron-builder 26 must use `mac.identity: "-"` for the ad hoc app signature, `hardenedRuntime: false`, `minimumSystemVersion: "26.0"`, no notarization, and no DMG signature.
- Treat the current root as an uncommitted plugin source checkout, not an app to migrate in place. Build and validate a clean React TypeScript candidate in a temporary directory, preserve the product documents and Wayfinder artifacts, then apply a reviewed file-by-file replacement of plugin-owned files.

The latest combined dependency set was verified from declared engines, peers, package metadata, and upstream source. A clean install and DMG proof did not complete during research, so implementation must pass the candidate and real-checkout install, check, test, build, package, signature, metadata, and launch gates before the plugin files are removed or the first app commit is made.
