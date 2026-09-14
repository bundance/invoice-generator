# Prove the PDF rendering approach

Type: prototype
Status: resolved
Blocked by: 03, 06, 10

## Question

Which shared preview-and-export rendering approach reliably reproduces the reference A4 invoice and the approved credit-note adaptation, preserves selectable text and the logo, generates the required filenames, and can be verified automatically?

## Comments

### Prototype ready for review

- Asset: [PDF rendering approach prototype](../prototypes/pdf-rendering/README.md)
- Run the interactive proof with `vp run prototype:pdf-rendering`.
- Run both exports and their automatic checks with `vp run prototype:pdf-rendering:verify`.
- The proof uses one fixed A4 HTML/CSS renderer for the on-screen preview and Electron 44.1.1 `webContents.printToPDF` export. Invoice and full-credit-note facts are data variants, not separate document templates.
- The generated `GGIOHK-0043.pdf` and `CN-GGIOHK-0043.pdf` are each one-page A4 PDFs with selectable text, embedded fonts, and the exact reference wordmark. The renderer-fit check passes for both normal documents and blocks the deliberate overflow case.
- The proposed retained and exported filename is `<document-id>.pdf`. A future visual regression check should compare rasterized output with a human-approved baseline after masking PDF metadata; structural checks alone do not approve layout fidelity.

The human approved the rendered invoice, credit note, shared renderer, and identifier-only filename rule.

## Answer

Use one fixed A4 document renderer for both the live preview and PDF export. In the production React app, a pure render model supplies an invoice or full-credit-note snapshot to one shared document component. The Document studio mounts that component on its scaled canvas. Export mounts the same component and styles in a hidden, sandboxed Electron renderer; there is no second print template.

The export renderer must wait for fonts and images, then measure every fixed region that contains variable text. Any horizontal or vertical overflow blocks issue. Once every region fits, Electron 44 calls `webContents.printToPDF` with CSS A4 sizing, zero printer margins, backgrounds enabled, CSS page size preferred, and tagged PDF output enabled. Use `@page { size: A4; margin: 0; }` and keep all document spacing inside the shared page component.

Keep text as HTML text so it remains selectable. Embed the fixed Codernetic wordmark as an image asset at its native 334 by 72 pixel size; do not redraw it separately for export. The approved invoice and full-credit-note samples both produce one A4 page with embedded fonts, selectable text, an unchanged wordmark, and no clipped regions.

Name the retained PDF `<document-id>.pdf`: for example, `GGIOHK-0043.pdf` and `CN-GGIOHK-0043.pdf`. Use the same name as the default when exporting a retained document elsewhere. A user may rename that external copy, but the app-managed retained file keeps its identifier-only name.

PDF preparation remains before the durable issue commit. The app writes and verifies the final PDF, then stores those exact bytes with the immutable snapshot when issue consumes the invoice number. Opening or exporting an issued document reads the retained PDF; it never regenerates historical output.

Automated verification must generate representative invoice and credit-note PDFs through the real Electron renderer and check:

- the expected identifier-only filenames;
- one A4 page and no extra pages;
- required selectable text for identifiers, parties, totals, tax wording, original-invoice links, and correction reasons;
- embedded fonts and the exact wordmark pixels;
- zero overflow in every variable-content region, plus a deliberate overlong case that the fit gate rejects;
- successful fixed-DPI rasterization for visual comparison.

Visual fidelity still needs an approved raster baseline. Compare each fixed-DPI render with that baseline using a documented small tolerance; do not compare raw PDF bytes because creation metadata can change without changing the page. Any visual difference outside the tolerance requires human review. Keep the prototype as decision evidence only; do not ship its controls or sample data.
