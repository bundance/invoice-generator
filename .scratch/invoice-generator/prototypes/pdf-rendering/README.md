# PDF rendering approach prototype

Throwaway proof for the shared invoice preview and PDF export decision.

It uses one fixed A4 HTML/CSS renderer for the on-screen preview and Electron 44.1.1 `webContents.printToPDF` export. The invoice and full credit note are data variants of that renderer. The prototype also measures fixed regions before export, keeps PDF text selectable, embeds the exact wordmark extracted from the sole reference PDF, and proposes identifier-only retained filenames.

Run the interactive prototype from the repository root:

```sh
vp run prototype:pdf-rendering
```

Run the batch proof and automatic structural checks:

```sh
vp run prototype:pdf-rendering:verify
```

The proof writes `output/pdf/GGIOHK-0043.pdf` and `output/pdf/CN-GGIOHK-0043.pdf`. It renders inspection PNGs under `tmp/pdfs/pdf-rendering-proof/`.

The automatic check requires Poppler's `pdfinfo`, `pdftotext`, `pdffonts`, `pdfimages`, and `pdftoppm` commands. It checks one-page A4 output, required selectable text, embedded fonts, the exact 334 by 72 pixel wordmark, and stable filenames. A human still approves the fixed layout and a rendered baseline; later regression checks compare against that approved baseline rather than pretending DOM measurements prove visual fidelity.
