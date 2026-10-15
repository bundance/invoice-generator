# Invoice Generator

Invoice Generator is a private, offline macOS app for creating Codernetic invoices and credit
notes. It stores its dataset and retained PDFs on the Mac. The production app blocks network
requests.

The packaged app supports Apple Silicon Macs running macOS 26 or later. The DMG is built locally,
uses an ad hoc app signature, and is not notarized.

## Install the app

Use a DMG produced by the [build steps](#build-a-fresh-electron-app-and-dmg).

1. Open `release/Invoice Generator-0.1.0-arm64.dmg`.
2. Drag **Invoice Generator** to **Applications**.
3. Open **Invoice Generator** from **Applications**.
4. If Gatekeeper blocks the first launch, open **System Settings > Privacy & Security** and choose
   **Open Anyway** for Invoice Generator. Confirm the next macOS prompt.

Gatekeeper displays this warning because the private build is not notarized. Do not bypass a
warning for a DMG that you did not build or receive through a trusted private channel.

## Set up the app

Complete two steps before you create the first invoice:

1. Open **Settings**. Enter the issuer, VAT, bank, and business details, then select **Save now**.
2. Open **Clients**. Select **Create first client**, enter the invoice defaults and number series,
   then save the client.

Each client has its own invoice prefix, next number, currency, day rate, VAT treatment, service
description, and payment terms. Creating or selecting a client does not consume an invoice number.

## Create and issue an invoice

1. Open **Create invoice** and select the client on the **Client** tab.
2. Enter the first service item on the **Work** tab. Use **Add item** or **Duplicate item** for more work, then enter each item's dates, description, day rate, billable days, and VAT rate when applicable.
3. Enter the issue and tax details on the **Tax & issue** tab.
4. Check the generated PDF preview, then select **Review and issue**.
5. Read the final review and select **Issue** to create the numbered invoice and retained PDF.

The app autosaves the draft on this Mac. Closing and reopening the app offers to resume the saved
draft. Validation links take you to the field that needs attention. Only the final issue action
consumes the next invoice number.

## Use issued documents

Open **Invoices** to find issued invoices and credit notes.

- Select **Open** to view the retained PDF.
- Select **Export** to save an exact copy of the retained PDF.
- Select **Print** to send the retained PDF to the macOS print dialog.
- Select **Correct** to issue a full credit note. You can then create a linked replacement invoice.

Issued documents do not change when you edit the current issuer or client settings.

## Back up and restore the dataset

Open **Settings** and use the **Backup and restore** card.

1. Select **Create backup** and choose where to save the ZIP file.
2. To restore, select **Restore backup** and choose a backup ZIP.
3. Check the archive summary, then select **Replace complete dataset**.

A restore replaces the complete dataset. It never merges records. The app reloads or restarts after
a successful restore.

Backup ZIP files contain financial and personal data, including retained PDFs. Invoice Generator
does not encrypt them. Store and share them as carefully as the invoices themselves.

## Set up the development checkout

Development requires an Apple Silicon Mac, macOS 26 or later, and Git. The repository uses
[Vite+](https://viteplus.dev/guide/) to install dependencies and run its pinned Node.js and pnpm
versions.

1. Install Vite+ if `vp --version` is not available:

   ```sh
   curl -fsSL https://vite.plus | bash
   ```

2. Open a new shell and enable Vite+ managed mode:

   ```sh
   vp env on
   ```

3. Change to the repository root and install the Node.js version from `.node-version`:

   ```sh
   vp env install
   ```

4. Install the locked dependencies:

   ```sh
   CI=true vp install --frozen-lockfile
   ```

5. Confirm that package scripts use the project Node.js version:

   ```sh
   vp run check:runtime
   ```

Managed mode is Vite+'s default. It reads the nearest `.node-version`, `devEngines.runtime`,
`engines.node`, or `.nvmrc` file. Running `vp env off` enables system-first mode and lets another
Node.js installation take priority over the project pin.

Use `vp install`, `vp add`, and `vp remove` for dependency work. Direct `npm` or `pnpm` commands
bypass the repository runtime contract.

## Run the app in development mode

Start Vite and Electron from the repository root:

```sh
vp run dev
```

The Electron window opens when the renderer and main process are ready. Source changes rebuild the
affected code. Press `Ctrl+C` to stop the development process.

## Test a change

Run the smallest relevant test while you work. Replace the example path with the test files or
directories that cover your change:

```sh
vp test run src/domain/invoices/invoice-draft.test.ts --allowOnly=false --retry=0
```

Before you finish an application change, run the routine suite and quality checks:

```sh
vp run test
vp run check:quality
```

To run the Playwright Electron journeys against a production build, use normal macOS GUI process
access:

```sh
vp run build
vp run test:electron
```

Electron can fail with `EPERM` or `SIGABRT` inside a restricted command sandbox. Rerun the command
with normal macOS GUI access before treating that result as an app failure.

## Build a fresh Electron app and DMG

The production build creates the renderer, Electron main process, and preload output. Packaging
then creates a new arm64 app and DMG.

1. Build the production application:

   ```sh
   vp run build
   ```

2. Create a fresh macOS package:

   ```sh
   vp run package:mac
   ```

3. Inspect the package contract:

   ```sh
   vp run inspect:package
   ```

The packaging step removes and recreates `release/`. The main outputs are:

- `release/mac-arm64/Invoice Generator.app`
- `release/Invoice Generator-0.1.0-arm64.dmg`
- `release/release-candidate.json`, created by package inspection

Run the full local release gate when you need a release candidate rather than a development build:

```sh
vp run validate
```

Run this command with normal macOS GUI process access. It runs quality checks, unit and component
tests, the production build, Electron journeys, PDF checks, DMG packaging, and package inspection.
A passing run prints `LOCAL RELEASE GATE PASSED` and the exact artifact SHA-256. Automated success
does not complete the human approval checks recorded in `release/acceptance-report.json`.

## Maintainer and agent details

The [harness guide](docs/harness/README.md) documents release-stage time limits, generated output,
retained failure evidence, Electron launch permissions, and failure diagnosis. It is reference
material for maintainers and coding agents, not the starting point for app users.
