# 28: Fit Live A4 previews to the available workspace

**What to build:** Replace the fixed 65-percent document presentation with one shared preview frame that makes invoice and credit-note documents use the available workspace. Every Live A4 preview opens in Fit mode, grows when more room is available, preserves the fixed A4 proportions, and remains visible beside the editing content without changing the final PDF layout.

**Blocked by:** None (can start immediately). Ticket 25, Prove fixed-layout PDF fidelity, is complete.

**Status:** completed

- [x] Invoice and credit-note previews use one shared presentation frame while continuing to render the existing fixed A4 document component.
- [x] Every newly mounted Live A4 preview starts in Fit mode and uses the largest scale that fits its available inner width and height, capped at 100 percent.
- [x] Fit responds to changes in the preview container rather than a hard-coded window size or height breakpoint.
- [x] The fixed document remains 210mm by 297mm. Fitting changes only its outer presentation and never reflows, compresses, or restyles document content.
- [x] The scaled page retains the exact A4 ratio and has layout dimensions that match its visible size instead of relying on a visual transform alone.
- [x] The preview remains pinned beneath the page heading while the invoice-draft inspector and page content scroll normally, and the supported desktop layout remains side by side.
- [x] At the supported minimum and default window sizes, the complete page remains contained in Fit mode. At a taller window size, the page becomes larger than the former fixed 65-percent presentation when width permits.
- [x] Fit never enlarges the page beyond 100 percent, even when the preview has more space.
- [x] Focused React and production Electron tests prove container resizing, minimum/default/tall geometry, A4 proportions, the 100-percent ceiling, and consistent invoice and credit-note behavior through observable output.
- [x] Existing document overflow, embedded-font, structural PDF, and exact raster checks pass without changing their approved baselines.
- [x] The required quality check, full validation gate, and live Electron verification pass before completion.
