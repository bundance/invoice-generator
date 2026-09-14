# Electron and React toolchain for the invoice generator

Research checked on 3 September 2026. This recommends the first app scaffold for the already-decided personal-use boundary: macOS 26 or later, Apple Silicon only, one locally built DMG, ad hoc signing, no notarization, and manual updates.

## Recommendation

Use one Vite React TypeScript application with Electron main and preload entry points built by `vite-plugin-electron/simple`. Use Vite+ as the only day-to-day toolchain command, Tailwind CSS v4 through its Vite plugin, shadcn/ui with the Radix base, Vitest through Vite+, and electron-builder 26 for the single arm64 DMG.

Do not start from this checkout's current package, source, tests, or playground structure. They are the `vite-plugin-electron` package repository, not an application scaffold. Generate a clean React TypeScript app beside the checkout, add the Electron boundary there, validate it, then apply that known diff to this repository while preserving the planning and prototype files listed below.

## Exact version set

Pin the initial scaffold exactly. The lockfile then records all transitive packages.

| Ownership     | Package or runtime                 |                                                                                                                                                 Version | Reason                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project       | Node.js                            |                                                                                                                                               `24.20.0` | The Vite+-managed Node already selected in this checkout. It satisfies Vite+ 0.3.0, shadcn 4.20.1, the React Vite plugin, jsdom 30, Electron's installer, and electron-builder.                                                                                                                                                                                                                   |
| Project       | pnpm                               |                                                                                                                                               `11.25.0` | Current pnpm release, selected explicitly by the user. pnpm 11 enables a 24-hour minimum release age by default; this scaffold strengthens it to seven days, retains trust-downgrade checks, and records exact temporary exceptions for the reviewed newest toolchain graph. ([dependency resolution settings](https://pnpm.io/settings/dependency-resolution))                                   |
| Project       | `electron`                         |                                                                                                                                                `44.1.1` | Current stable Electron. It contains Chromium `152.0.7977.65`, Node `24.19.0`, and V8 `15.2.124.18`. ([Electron release](https://releases.electronjs.org/release/v44.1.1), [npm metadata](https://registry.npmjs.org/electron/44.1.1))                                                                                                                                                            |
| Project       | `react`, `react-dom`               |                                                                                                                                                `19.2.8` | Matching current React and React DOM patches. React documents 19.2 as the current line; React DOM 19.2.8 peers on React 19.2.8. ([React versions](https://react.dev/versions), [React](https://registry.npmjs.org/react/19.2.8), [React DOM](https://registry.npmjs.org/react-dom/19.2.8))                                                                                                        |
| Project       | `typescript`                       |                                                                                                                                                 `7.0.2` | Current TypeScript patch. Vite+ core 0.3.0 explicitly accepts TypeScript 7. ([TypeScript docs](https://www.typescriptlang.org/docs/), [npm metadata](https://registry.npmjs.org/typescript/7.0.2), [Vite+ core metadata](https://registry.npmjs.org/%40voidzero-dev%2Fvite-plus-core/0.3.0))                                                                                                      |
| Project       | `vite-plus`                        |                                                                                                                                                 `0.3.0` | Current published Vite+ release. ([upgrade guide](https://viteplus.dev/guide/upgrade), [npm metadata](https://registry.npmjs.org/vite-plus/0.3.0))                                                                                                                                                                                                                                                |
| Project alias | `vite`                             |                                                                                                                `npm:@voidzero-dev/vite-plus-core@0.3.0` | Required Vite-compatible dependency edge. Core 0.3.0 bundles Vite 8.2.2, Rolldown 1.2.5, and tsdown 0.22.14. ([migration rules](https://viteplus.dev/guide/migrate-rules), [core metadata](https://registry.npmjs.org/%40voidzero-dev%2Fvite-plus-core/0.3.0))                                                                                                                                    |
| Project       | `vite-plugin-electron`             |                                                                                                                                                 `1.1.2` | Current plugin. Its `vite >=6` peer is satisfied by Vite+ core's Vite 8.2.2 implementation. Its v1 README explicitly supports Vite 7 and 8 and recommends the simple API. ([README](https://github.com/electron-vite/vite-plugin-electron/blob/main/README.md), [npm metadata](https://registry.npmjs.org/vite-plugin-electron/1.1.2))                                                            |
| Project       | `@vitejs/plugin-react`             |                                                                                                                                                 `6.1.1` | Current React plugin. It requires Vite 8, which Vite+ core 0.3.0 bundles. ([npm metadata](https://registry.npmjs.org/%40vitejs%2Fplugin-react/6.1.1))                                                                                                                                                                                                                                             |
| Project       | `tailwindcss`, `@tailwindcss/vite` |                                                                                                                                                 `4.3.3` | Matching current Tailwind packages. The Vite plugin accepts Vite 5 through 8. Tailwind v4's browser floor is far below Electron 44's Chromium. ([Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite), [compatibility](https://tailwindcss.com/docs/compatibility), [plugin metadata](https://registry.npmjs.org/%40tailwindcss%2Fvite/4.3.3))                              |
| Project       | `shadcn`                           |                                                                                                                                                `4.20.1` | Pin the CLI/package used to initialize and add components. Use its Vite template, Radix base, `new-york` style, CSS variables, and Lucide icons. shadcn supports React 19 and Tailwind v4. ([Vite setup](https://ui.shadcn.com/docs/installation/vite), [Tailwind v4 support](https://ui.shadcn.com/docs/tailwind-v4), [npm metadata](https://registry.npmjs.org/shadcn/4.20.1))                  |
| Project       | shadcn shared packages             |                                   `class-variance-authority 0.7.1`, `clsx 2.1.1`, `lucide-react 1.40.0`, `tailwind-merge 3.6.0`, `tw-animate-css 1.4.0` | Pin the common packages created by the current shadcn setup. Add only the Radix packages required by components actually generated; do not install every primitive in advance. ([manual setup](https://ui.shadcn.com/docs/installation/manual), [Lucide metadata](https://registry.npmjs.org/lucide-react/1.40.0))                                                                                |
| Project       | `electron-builder`                 |                                                                                                                                               `26.15.3` | Current stable builder. Pin v26 because v27 moves macOS signing fields into a new `mac.sign` object. ([npm metadata](https://registry.npmjs.org/electron-builder/26.15.3), [v27 migration](https://www.electron.build/docs/migration/v27-breaking-changes/))                                                                                                                                      |
| Project       | React tests                        | `@testing-library/dom 10.4.1`, `@testing-library/react 16.3.3`, `@testing-library/user-event 14.6.7`, `@testing-library/jest-dom 7.0.1`, `jsdom 30.0.1` | React Testing Library 16 accepts React 18 or 19. jest-dom 7 requires Vitest and Testing Library DOM 10. jsdom 30 accepts Node 24.15 or later, so Node 24.20.0 satisfies it. ([React Testing Library](https://registry.npmjs.org/%40testing-library%2Freact/16.3.3), [jest-dom](https://registry.npmjs.org/%40testing-library%2Fjest-dom/7.0.1), [jsdom](https://registry.npmjs.org/jsdom/30.0.1)) |
| Vite+ owned   | Vitest                             |                                                                                                                                                `4.1.11` | Vite+ 0.3.0 depends on this exact version. Keep the pnpm override and a direct catalog entry because jest-dom has a required Vitest peer. Import test APIs from `vite-plus/test`. ([Vite+ metadata](https://registry.npmjs.org/vite-plus/0.3.0), [migration rules](https://viteplus.dev/guide/migrate-rules))                                                                                     |
| Vite+ owned   | Oxlint, Oxfmt                      |                                                                                                                                      `1.79.0`, `0.64.0` | These are exact dependencies of Vite+ 0.3.0. Do not add separate project dependencies or standalone configs. Configure them in `vite.config.ts` and run them through `vp`. ([Vite+ metadata](https://registry.npmjs.org/vite-plus/0.3.0), [lint guide](https://viteplus.dev/guide/lint), [format guide](https://viteplus.dev/guide/fmt))                                                          |

Also pin `@types/node` to `24.13.3`, `@types/react` to `19.2.18`, and `@types/react-dom` to `19.2.6`. Keeping Node types on major 24 matches both the development runtime and Electron 44's embedded Node major. ([Electron metadata](https://registry.npmjs.org/electron/44.1.1), [Node types](https://registry.npmjs.org/%40types%2Fnode/24.13.3))

All of these web and build packages belong in `devDependencies`. The plugin's own packaging guidance recommends this because Vite bundles web code and electron-builder would otherwise package a second copy. Leave `dependencies` empty until the main process needs a native module or another package intentionally externalized from the Electron build. ([vite-plugin-electron dependency guidance](https://github.com/electron-vite/vite-plugin-electron/blob/main/README.md#dependencies-vs-devdependencies))

## The Vite+ alias is mandatory

`vite-plus` alone does not satisfy a package that peers on the package name `vite`. `vite-plugin-electron`, `@vitejs/plugin-react`, `@tailwindcss/vite`, and Vitest all use that name.

Vite+'s current pnpm migration rules require two things:

1. every package that depends on `vite-plus` gets a direct `vite` development dependency;
2. the workspace maps `vite` to the same release of `@voidzero-dev/vite-plus-core`.

An override alone does not create the direct dependency edge. Without that edge pnpm can install upstream Vite to satisfy a peer, leaving two Vite implementations in one graph. Vite+ also uses `vite@*` and `vitest@*` override keys so catalog references remain catalog references. ([Vite+ migration rules, "Vite and Overrides"](https://viteplus.dev/guide/migrate-rules#vite-and-overrides))

Use this root `pnpm-workspace.yaml`:

```yaml
packages:
  - .

allowBuilds:
  electron: true
  electron-winstaller: false

minimumReleaseAge: 10080
minimumReleaseAgeExcludePrune: true

trustPolicy: no-downgrade

catalog:
  vite: npm:@voidzero-dev/vite-plus-core@0.3.0
  vite-plus: 0.3.0
  vitest: 4.1.11

overrides:
  vite@*: "catalog:"
  vitest@*: "catalog:"

peerDependencyRules:
  allowAny:
    - vite
```

The checked-in workspace file also records exact, automatically pruned release-age exceptions for versions in the approved newest dependency graph, plus the two reviewed legacy `semver` trust exceptions required transitively by the pinned build tools. Keep those date-sensitive lists in the workspace file rather than duplicating them here.

Then declare all three catalog entries in `devDependencies`:

```json
{
  "vite": "catalog:",
  "vite-plus": "catalog:",
  "vitest": "catalog:"
}
```

`allowAny` suppresses the false peer warning caused by pnpm comparing a plugin's Vite range with the alias package's `0.3.0` version. Compatibility comes from core's recorded bundled Vite version, 8.2.2, not the wrapper's release number. It must not be used to excuse unrelated peer conflicts.

## Application and configuration shape

Use this structure:

```text
electron/
  main.ts
  preload.ts
src/
  components/ui/
  lib/utils.ts
  test/setup.ts
  app.tsx
  index.css
  main.tsx
index.html
components.json
electron-builder.yml
package.json
pnpm-workspace.yaml
tsconfig.json
tsconfig.app.json
tsconfig.node.json
vite.config.ts
```

Use `vite-plugin-electron/simple`, not its renderer plugin. The renderer needs no Node.js API. The preload should expose one narrow, typed function per IPC action through `contextBridge`; it must not expose `ipcRenderer` itself. Electron recommends current releases, context isolation, renderer sandboxing, no Node integration, a restrictive content security policy, limited navigation, and sender validation on every IPC handler. ([Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [preload scripts](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload))

The relevant `vite.config.ts` shape is:

```ts
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: { entry: "electron/main.ts" },
      preload: { input: "electron/preload.ts" },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  fmt: {},
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
  staged: {
    "*": "vp check --fix",
  },
});
```

Do not set TypeScript `baseUrl`. Vite+'s tsgolint type-checking path does not support it. Put `"@/*": ["./src/*"]` in `compilerOptions.paths` in the root and app TypeScript configs, and mirror it with the Vite alias above. ([Vite+ troubleshooting](https://viteplus.dev/guide/troubleshooting#vp-check-does-not-run-type-aware-lint-rules-or-type-checks))

Use separate referenced configs so renderer code has DOM and `vite/client` types but not Node globals, while `electron/**` and `vite.config.ts` have Node types. `vp check` should remain the one static gate. Vite+ documents that it runs Oxfmt, Oxlint, and type checking together when `typeAware` and `typeCheck` are enabled. ([check guide](https://viteplus.dev/guide/check))

Initialize shadcn after the clean Vite React files exist:

```sh
pnpm dlx shadcn@4.20.1 init --template vite --base radix --yes
```

Commit the generated `components.json` and source files. Keep `style: "new-york"`, `rsc: false`, `tsx: true`, CSS variables enabled, `src/index.css`, and the `@` aliases. The global CSS starts with the current v4 imports:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
```

Run component additions through the same pinned CLI, for example `pnpm dlx shadcn@4.20.1 add button`. Review the diff because the shadcn CLI owns copied source and may overwrite customized components. ([shadcn Tailwind v4 guide](https://ui.shadcn.com/docs/tailwind-v4))

Use the Vite+ extension pack and the settings from its IDE guide, including `oxc.disableNestedConfig: true` and `oxc.fmt.disableNestedConfig: true`. Do not carry the plugin repository's standalone `oxlint.config.ts` or `oxfmt.config.ts` into the app. ([Vite+ IDE guide](https://viteplus.dev/guide/ide-integration))

## Testing boundary

The first scaffold needs three levels of evidence:

- Pure domain tests run in Vitest's Node environment. Put money, numbering, VAT, state validation, and issuance transitions here. These tests must not import Electron.
- React component tests use jsdom, React Testing Library, user-event, and `@testing-library/jest-dom/vitest`. Import `describe`, `it`, `expect`, and mocks from `vite-plus/test` so the test process uses Vite+'s runner identity.
- One packaging smoke test builds the production renderer and Electron entries, creates the DMG, verifies its signature and metadata, mounts it, and launches the installed app. Do not add a browser or Electron end-to-end framework until a real flow needs automation.

The jest-dom package has a non-optional Vitest peer, which is why this otherwise simple Node-mode project keeps a direct `vitest: "catalog:"` entry. Vite+'s migration rules require direct Vitest only for exactly this kind of peer or retained upstream reference. ([Vite+ migration rules](https://viteplus.dev/guide/migrate-rules#when-vitest-is-directly-required))

## Packaging configuration

Use electron-builder 26.15.3 with this macOS section:

```yaml
appId: com.codernetic.invoicegenerator
productName: Invoice Generator
asar: true
directories:
  output: release
files:
  - dist/**
  - dist-electron/**
  - package.json
mac:
  target:
    - target: dmg
      arch:
        - arm64
  identity: "-"
  hardenedRuntime: false
  minimumSystemVersion: "26.0"
  notarize: false
dmg:
  sign: false
```

For electron-builder v26, `identity: "-"` explicitly requests ad hoc signing. `identity: null` skips signing and is not equivalent. Its v26 option contract also says the default hardened runtime is incompatible with ad hoc signing unless library validation is disabled, so this credential-free build sets `hardenedRuntime: false`. ([electron-builder v26 source](https://github.com/electron-userland/electron-builder/blob/v26.15.3/packages/app-builder-lib/src/options/macOptions.ts), [DMG docs](https://www.electron.build/docs/dmg/))

Only the application bundle needs the ad hoc signature for this decision. Leave DMG container signing off. Do not add ZIP, update metadata, publishing, auto-update, Developer ID, entitlements for notarization, or Apple credentials.

The one packaging script should be:

```json
{
  "scripts": {
    "package:mac": "vp build && electron-builder --mac dmg --arm64"
  }
}
```

Invoke it as `vp run package:mac`. Vite+ reserves `vp build` for its built-in Vite build and uses `vp run <name>` for package scripts. ([Vite+ run guide](https://viteplus.dev/guide/run))

## Safe replacement plan

The repository currently has no commits, no remote, and an unborn `main`; every visible file is untracked. Git cannot recover an accidental deletion. The root `package.json` identifies `vite-plugin-electron` version 1.1.2, and the current `src`, `test`, most of `playground`, root typings, logos, changelog, and package build configs are plugin-repository material.

Replace it in this order:

1. Choose the exact non-`main` implementation branch name before creating the first commit. The repository rules prohibit committing on `main`.
2. Inventory and preserve `.scratch/invoice-generator/**`, `docs/**`, `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, and `.git`. Preserve `playground/invoice-prototype/**` long enough to compare its useful Electron prototype behavior, then move any lasting evidence under `.scratch/invoice-generator/prototypes/` before removing `playground`.
3. Generate the candidate in a fresh sibling temporary directory. Do not create it over this checkout and do not copy or move this checkout's `node_modules`.
4. Upgrade the global CLI to 0.3.0 with `vp upgrade 0.3.0`. From `/private/tmp`, generate the candidate with `vp create vite invoice-generator-app --package-manager pnpm --no-git --no-agent --no-editor --no-hooks -- --template react-ts`. The candidate must not generate Git, agent, editor, or hook files because this repository already owns those files and policies.
5. Apply the exact dependency and configuration decisions above to the candidate. Run shadcn initialization there. Add the secure Electron main/preload boundary and builder config.
6. Run the complete gate in the candidate. Do not delete any root file until the candidate passes.
7. Apply the candidate as a reviewed file-by-file diff. Replace package/config files and application source. Explicitly delete confirmed plugin-only paths. Never use a blanket recursive deletion or broad copy.
8. Regenerate `pnpm-lock.yaml` with `vp install`. Approve only Electron's install script in `pnpm-workspace.yaml`.
9. Run the full gate again in the real checkout. Inspect `git status --short` and `git diff --check` before any commit, and stage only the intended replacement paths.

The candidate gate is:

```sh
vp env doctor
vp toolchain
vp install --frozen-lockfile
vp check
vp test run
vp build
vp run package:mac
```

Then verify the produced artifact:

```sh
file "release/mac-arm64/Invoice Generator.app/Contents/MacOS/Invoice Generator"
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Invoice Generator.app"
codesign -dv --verbose=4 "release/mac-arm64/Invoice Generator.app"
plutil -p "release/mac-arm64/Invoice Generator.app/Contents/Info.plist"
```

The evidence must show an arm64 executable, a valid ad hoc application signature, and `LSMinimumSystemVersion` equal to `26.0`. Mount the DMG, drag the app to Applications, follow the already-approved Privacy & Security "Open Anyway" path, and confirm the packaged app can create its application-data directory. Gatekeeper rejection on first launch is expected because the app is not notarized.

## Compatibility evidence and remaining risks

The version graph is mutually compatible by the current packages' declared engines and peers:

- Node 24.20.0 satisfies every selected host-tool engine, including Vite+ 0.3.0 and jsdom 30.0.1.
- Vite+ core 0.3.0 records bundled Vite 8.2.2. That satisfies `vite-plugin-electron >=6`, `@vitejs/plugin-react ^8`, and `@tailwindcss/vite` through Vite 8.
- React DOM 19.2.8 requires React 19.2.8. React Testing Library 16.3.3 and Lucide 1.40.0 both accept React 19.
- Vite+ 0.3.0 owns Vitest 4.1.11, Oxlint 1.79.0, and Oxfmt 0.64.0. The exact override prevents a second Vitest instance.
- electron-builder 26.15.3 exposes the v26 `mac.identity` and `mac.hardenedRuntime` fields used above.

A disposable clean install and DMG proof was started during this research but did not complete, so package metadata and upstream source are the evidence for the newest combined set. The implementation session must treat the candidate gate as mandatory, not optional.

Other open risks:

- Vite+ remains beta before 1.0. Pin 0.3.0 and upgrade only through `vp upgrade` plus `vp migrate`, followed by the whole gate. Vite+'s upgrade command keeps the wrapper, core alias, and Vitest pin aligned. ([upgrade guide](https://viteplus.dev/guide/upgrade))
- Electron releases quickly for Chromium security. `44.1.1` is the correct starting pin, not a permanent freeze. Review current stable Electron patches before each packaged release and rerun the packaging smoke test. Electron itself recommends staying current. ([Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security#16-use-a-current-version-of-electron))
- electron-builder v27 is a breaking migration. Do not accept it in a broad update because the v26 signing keys above move under `mac.sign` in v27. ([v27 migration](https://www.electron.build/docs/migration/v27-breaking-changes/))
- Ad hoc signing and Gatekeeper behavior still needs a real macOS 26 packaged-app check on each owned Mac model used. The build is intentionally neither Developer ID signed nor notarized.
- If the app later adds native Node modules, move only those modules to `dependencies`, keep renderer isolation, and add architecture and rebuild checks. The current dependency set needs no native runtime module beyond Electron itself.

## Decision this research supports

Adopt the exact pinned set above, preserve the direct `vite` alias and exact Vitest pin, use the simple plugin API with a narrow preload bridge, centralize Oxlint/Oxfmt/Vitest in Vite+, and package only an ad hoc-signed arm64 DMG with electron-builder 26. Build and validate the fresh candidate before replacing the untracked plugin repository files.
