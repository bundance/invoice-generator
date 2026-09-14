# PDF raster baselines

These PNGs are the approved 144 DPI fixed-layout evidence for the supplied reference invoice and each supported production document shape. The Electron version is pinned in `package.json`. Production documents embed Arimo 5.3.0 from `@fontsource/arimo` and the fixed 334 by 72 pixel Codernetic wordmark.

The comparator requires every pixel to match. Three consecutive renders of each production fixture produced zero changed pixels, so zero is the smallest tolerance that accepts repeat output. It also requires a 1684 pixel A4 height and permits a one-pixel width difference, 1190 or 1191 pixels. Electron and the supplied Quartz PDF report slightly different sub-point A4 widths, which round to adjacent pixels at 144 DPI.

Validation only reads these files. It has no update or approval mode. Changing a PNG is a source change that must be reviewed beside the rendered difference and approved by a human who has compared it with `docs/Codernetic-invoice-GGIOHK-0043.pdf`.

- `reference-invoice-144dpi.png` is rasterized from the supplied visual authority.
- `outside-scope-invoice-144dpi.png` covers the outside-scope invoice fixture.
- `gbp-vat-invoice-144dpi.png` covers the GBP VAT fixture.
- `foreign-currency-vat-invoice-144dpi.png` covers the foreign-currency VAT fixture and sterling summary.
- `full-credit-note-144dpi.png` covers the linked full-credit-note fixture.
- `foreign-currency-full-credit-note-144dpi.png` covers the combined full-credit-note and sterling-summary layout.
