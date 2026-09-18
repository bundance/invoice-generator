# 27: Improve Live A4 preview usability and fidelity

Type: spec
Status: ready-for-agent
Label: ready-for-agent
Blocked by: 25, Prove fixed-layout PDF fidelity.

## Problem Statement

The issuer's owner cannot make effective use of the Live A4 preview at different window sizes. The preview is fixed at 65 percent, so a tall window leaves a large unused area beneath the document instead of making the document easier to inspect. The document text is consequently difficult to read, and there is no way to zoom in.

The visible preview can also present fallback typography even though the final PDF uses the bundled Arimo faces. The shared document component declares the correct fonts, but the visible renderer does not wait for or verify those faces before presenting the document. A preview rendered with fallback typography is not an honest representation of the final PDF.

The Client legal name field in the invoice-draft inspector is unnecessarily constrained to half of the available width. Long legal names are truncated visually even though the surrounding Unnumbered Draft inspector has room for a full-width control.

These problems undermine the document-led editing experience. The Live A4 preview should remain the dominant canvas, stay visibly faithful to the final PDF, and remain readable without changing the fixed invoice layout itself.

## Solution

Introduce one shared presentation frame for every Live A4 preview. The frame will leave the fixed A4 document unchanged while owning responsive fitting, manual zoom, scrolling, toolbar controls, font readiness, and preview-local failure recovery.

Every preview will open in Fit mode. Fit will scale the document to the largest size that fits both the available preview width and height, preserve the A4 proportions, and stop at 100 percent. It will recalculate when its container changes size. The preview will remain pinned beside the invoice-draft inspector so that the resulting document stays visible while the user edits and scrolls the form.

The toolbar will provide Fit, zoom out, a read-only percentage, and zoom in. Manual zoom will range from 25 to 200 percent in 10-percentage-point steps. A manually zoomed document that exceeds the viewport will be reachable through ordinary two-dimensional scrolling.

The frame will not reveal the document as ready until all required bundled Arimo font faces have loaded successfully. While they load, it will present a busy preparation state rather than fallback typography. If loading fails, it will present a persistent local error and Retry action. Review and issue actions will remain unavailable until the visible preview is font-faithful. The final PDF renderer will retain its independent font verification.

Make Client legal name explicitly span the full invoice-draft inspector width. Do not change the layout of legal-name fields in other forms.

## User Stories

1. As the issuer's owner, I want the Live A4 preview to grow when I make the application window taller, so that unused space becomes a more readable document.
2. As the issuer's owner, I want the preview scale to account for both available width and available height, so that the complete A4 page remains visible in Fit mode.
3. As the issuer's owner, I want the preview to preserve the A4 proportions at every supported window size, so that responsive behavior never distorts the document.
4. As the issuer's owner, I want Fit mode to stop at 100 percent, so that an unusually large display does not make the automatic preview unnecessarily oversized.
5. As the issuer's owner, I want the document's internal layout to remain fixed while the preview changes size, so that responsive presentation cannot change the final PDF.
6. As the issuer's owner, I want the preview to respond when its actual container changes size, so that resizing the window gives immediate and accurate feedback.
7. As the issuer's owner, I want every Live A4 preview to open in Fit mode, so that a complete document is visible without an initial adjustment.
8. As the issuer's owner, I want a clearly labelled Fit control, so that I can return from manual zoom to responsive sizing.
9. As the issuer's owner, I want zoom-in and zoom-out controls, so that I can inspect document text and details that are difficult to read at the fitted size.
10. As the issuer's owner, I want to see the current zoom percentage, so that the preview scale is understandable rather than hidden.
11. As the issuer's owner, I want 100 percent to mean the untransformed fixed-A4 document size, so that the displayed percentage has a stable meaning.
12. As the issuer's owner, I want manual zoom to range from 25 to 200 percent, so that I can see either the whole page context or fine document detail.
13. As the issuer's owner, I want zoom controls to move in 10-percentage-point steps, so that each change is predictable and repeatable.
14. As the issuer's owner, I want using zoom in or zoom out to leave Fit mode, so that my selected scale is not immediately replaced by automatic fitting.
15. As the issuer's owner, I want a manual zoom percentage to remain stable when the window resizes, so that resizing the application does not discard my inspection choice.
16. As the issuer's owner, I want Fit mode to resume responsive recalculation after I select Fit, so that returning to automatic behavior is explicit.
17. As the issuer's owner, I want an enlarged page to scroll in both directions instead of being clipped, so that every part of the document remains reachable.
18. As the issuer's owner, I want the page centred while it fits inside the viewport, so that the document canvas remains visually balanced.
19. As the issuer's owner, I want returning to Fit to remove unnecessary overflow and recenter the document, so that the preview returns to a clean whole-page view.
20. As the issuer's owner, I want ordinary wheel, trackpad, and scrollbar navigation when zoomed, so that inspecting the page uses familiar desktop interactions.
21. As the issuer's owner, I want the preview to stay visible beside the invoice-draft inspector while I scroll its content, so that edits remain connected to their document result.
22. As the issuer's owner, I want invoice and credit-note previews to use the same Fit and zoom behavior, so that document inspection is consistent throughout the application.
23. As a keyboard user, I want Fit, zoom out, and zoom in to appear in the logical tab order, so that I can operate the preview without a pointer.
24. As a keyboard user, I want the zoom controls to work with ordinary Enter and Space activation, so that they behave like normal application controls.
25. As a screen-reader user, I want icon-only zoom controls to have clear accessible names, so that their purpose is announced.
26. As a screen-reader user, I want the preview to announce that it is busy while document fonts load, so that a temporarily unavailable document is not mistaken for missing content.
27. As the issuer's owner, I want the visible document withheld until every required bundled Arimo face has loaded, so that fallback typography is never presented as a valid preview.
28. As the issuer's owner, I want a concise preparation message while the document fonts load, so that I understand why the page is not visible yet.
29. As the issuer's owner, I want a persistent local error when the preview fonts cannot load, so that a fidelity failure cannot pass unnoticed.
30. As the issuer's owner, I want to retry a failed preview-font load without losing invoice-draft work, so that a transient renderer problem is recoverable.
31. As the issuer's owner, I want Review and issue unavailable while the preview is loading or failed, so that I cannot proceed after seeing a document that is not known to match the final PDF.
32. As the issuer's owner, I want Review and issue restored after the fonts load or a retry succeeds, so that recovery returns me to the normal workflow.
33. As the issuer's owner, I want credit-note review and issue to obey the same preview-readiness rule, so that every issued document has the same fidelity protection.
34. As the issuer's owner, I want the final PDF renderer to verify its own fonts independently, so that visible-preview readiness cannot weaken the issue boundary.
35. As the issuer's owner, I want Client legal name to use the full width of the Unnumbered Draft inspector, so that a long legal name can be read and edited comfortably.
36. As the issuer's owner, I want other legal-name fields to retain their current layouts, so that this focused improvement does not unexpectedly restyle unrelated forms.
37. As the issuer's owner, I want each newly opened document preview to start in Fit mode, so that a previous document's inspection scale does not surprise me.
38. As the issuer's owner, I want preview zoom to remain a temporary viewing preference, so that it does not create a setting I must manage across application restarts.
39. As the application maintainer, I want one shared preview frame to own fitting, zoom, scrolling, and font readiness, so that invoice and credit-note behavior cannot drift apart.
40. As the application maintainer, I want responsive presentation isolated from the fixed A4 document renderer, so that preview usability changes cannot alter PDF layout or retained output.
41. As the application maintainer, I want stale font-loading attempts unable to replace the result of a newer retry, so that asynchronous completion order cannot corrupt visible readiness.
42. As the application maintainer, I want preview behavior proven at minimum, default, and tall supported window sizes, so that the change is not tuned to one screenshot.
43. As the application maintainer, I want existing structural and raster PDF checks to remain unchanged and pass, so that improved preview presentation cannot bless a document-output regression.

## Implementation Decisions

- Preserve the existing shared fixed-A4 document renderer as the sole source of document markup, styles, content, and assets. The Live A4 preview remains live HTML; do not replace it with an embedded or repeatedly generated PDF.
- Introduce one shared renderer-owned preview frame used by invoice and credit-note previews. It owns container measurement, Fit calculation, manual zoom state, scaled layout dimensions, overflow behavior, toolbar controls, font readiness, and local font-load recovery.
- Keep the document at its fixed `210mm` by `297mm` layout. Apply scaling only outside the document. Do not change document font sizes, spacing, fixed regions, line wrapping rules, page sizing, or export scale in response to viewport dimensions or zoom.
- Measure the actual inner preview area after accounting for its toolbar, padding, and gaps. Fit uses the smaller of the available-width scale, available-height scale, and 100 percent.
- Observe preview-container size changes rather than relying on a hard-coded window size or a height-specific media query. Recalculate only while the frame is in Fit mode.
- Model presentation mode as Fit or manual zoom. Every newly mounted preview starts in Fit. Fit is not persisted. Manual zoom is local to the current preview instance and remains at its absolute percentage when the frame resizes.
- Define 100 percent as the untransformed CSS size of the fixed A4 document. Fit may select any smaller scale required by the available area but never a scale above 100 percent.
- Provide Fit, zoom out, a read-only percentage, and zoom in in the preview toolbar. Manual zoom is clamped to 25 through 200 percent inclusive and changes in 10-percentage-point increments.
- Zoom in and zoom out enter manual mode. Fit re-enters responsive mode, removes unnecessary overflow, and recentres the page.
- Make the scaled page's layout box match its visual width and height. Do not rely on a transform alone, because a transform does not enlarge the scrollable layout area.
- Use ordinary two-dimensional scrolling when manual zoom exceeds the viewport. Do not add drag-to-pan, pinch-specific behavior, or application-level zoom keyboard shortcuts.
- Preserve the desktop side-by-side Document studio at supported window sizes. Keep the preview pinned beneath the page heading while the inspector and page content use normal scrolling.
- Give compact preview controls clear accessible names, visible focus treatment, disabled states at zoom bounds, and normal Tab, Enter, and Space behavior. Allow the toolbar to wrap rather than collide at its narrow supported width.
- Treat visible-preview font fidelity as explicit local state with `loading`, `ready`, and `failed` outcomes. Keep the document mounted during loading so that its inline font definitions exist, but cover it and mark the preview busy until readiness is proven.
- Load every Arimo font face required by the shared document and require the expected face count with every face reporting loaded. Do not treat the general font-set-ready signal by itself as proof that all required faces succeeded.
- Use concise loading copy such as `Preparing document preview…`. On failure, show a persistent preview-local alert explaining that the document preview font could not be loaded and provide Retry.
- Prevent an older font-loading attempt from overwriting a later retry or an unmounted preview. Font readiness must use the same stale-request discipline as other asynchronous renderer workflows.
- Disable the final review action associated with a Live A4 preview while its fonts are loading or failed. Restore the action only when the visible preview is ready. Keep final PDF font loading and validation independent and unchanged as the authoritative issue-boundary check.
- Extend the shared form-field presentation interface with an explicit full-width option. Use it for Client legal name in the invoice-draft inspector only. The input continues to fill its wrapper; the wrapper spans both inspector columns.
- Do not change persistence schemas, document snapshots, IPC contracts, invoice calculations, issue sequencing, retained-PDF behavior, or domain terminology.

## Testing Decisions

- Prefer the highest observable seam. The primary acceptance seam is the production Electron Live A4 preview: tests interact with the same controls and renderer that the issuer's owner sees rather than asserting private React state or CSS implementation details.
- Add production Electron coverage at the supported minimum window, the default window, and a taller window. Assert externally visible geometry: the page keeps the A4 ratio, remains contained in Fit, grows beyond the former fixed 65-percent presentation when space permits, and never exceeds the 100-percent Fit ceiling.
- Exercise Fit, zoom in, and zoom out through accessible toolbar controls. Assert the displayed percentage, bounds, mode transitions, and the return to responsive fitting.
- At an above-fit manual zoom, assert that the page remains reachable through both viewport axes and is not clipped. Assert that returning to Fit removes overflow and restores a centred whole-page view.
- Assert that invoice and credit-note previews expose the same controls and behavior through the shared frame. Avoid duplicating detailed state-machine tests separately for each document variant.
- Test the shared preview frame as the deterministic seam for font delay, failure, Retry, stale completion, and unmount safety. Inject or otherwise control the asynchronous font loader so these tests do not depend on timing or network interception.
- While font loading is unresolved, assert externally visible behavior: the frame is busy, preparation feedback is present, fallback document content is not presented as ready, and the associated final review action is unavailable.
- On font failure, assert a persistent local alert, a working Retry action, a still-withheld document, and a disabled final review action. After a successful retry, assert the document becomes visible and review is restored.
- Add a focused production Electron assertion that the visible document has the complete expected set of loaded Arimo faces, that representative regular, italic, and bold checks succeed, and that the page's computed document family resolves to Arimo.
- Retain the final PDF renderer's existing font-readiness and embedded-font checks. The visible-preview assertion supplements them; it does not replace them.
- Assert through the invoice-draft UI that Client legal name occupies the full inspector content width while nearby paired fields and legal-name fields in other forms retain their current layout.
- Use geometry and accessibility assertions for automated behavior, then capture live evidence at minimum, default, and tall window sizes to catch awkward toolbar wrapping, scrolling, focus, or visual balance that numeric assertions alone cannot prove.
- Keep all existing exact PDF raster baselines immutable. Run the existing PDF structural, overflow, embedded-font, and raster comparisons without updating baselines. Any output change is a regression unless separately reviewed and approved.
- Run the project's focused React and Electron tests while developing. Before completion, run the required quality check, the full authoritative validation gate, and the repository's live Electron verification workflow.

## Out of Scope

- Replacing the Live A4 preview with a PDF viewer or regenerating a PDF after each edit.
- Pixel-identical comparison between an arbitrarily scaled screen preview and a rasterized PDF. The required fidelity is identical content, document geometry, line wrapping, pagination, assets, and bundled font metrics.
- Changing the fixed invoice or credit-note layout, document styles, wordmark, bundled font family, PDF page size, export renderer, print settings, retained bytes, or approved PDF baselines.
- Allowing automatic Fit to enlarge the page beyond 100 percent.
- Persisting zoom across application restarts, carrying zoom into another document preview, or adding a user setting for preview scale.
- Global zoom shortcuts, application-shell zoom, mouse-drag panning, or custom pinch gestures.
- Adding mobile layouts, reducing the supported desktop minimum, or stacking the New Invoice preview beneath the inspector.
- Creating alternate invoice layouts, themes, responsive document reflow, or a document designer.
- Restyling legal-name fields outside the invoice-draft inspector.
- Changing invoice-draft persistence, issued-document data, domain validation, calculations, numbering, credit-note rules, or issue semantics.
- Adding a new domain glossary term or architecture decision record for reversible presentation behavior.

## Further Notes

- Use the established terms **Live A4 preview**, **invoice draft**, **invoice layout**, **final PDF**, and **retained PDF**. The left-hand editing canvas is not itself a PDF.
- This specification depends on and preserves the completed fixed-layout PDF-fidelity contract. It replaces only the hard-coded 65-percent preview presentation and the absence of visible-renderer font readiness.
- The final PDF renderer already waits for and verifies the bundled Arimo faces. The visible preview must meet an equivalent user-facing readiness standard, while the final renderer remains independently authoritative.
- The fixed-layout output may render with different screen antialiasing at different scales. That difference is acceptable when font identity, metrics, content, geometry, wrapping, pagination, and assets agree.
- No domain glossary amendment or ADR is required. The work creates a shared presentation owner but does not change the invoice domain or introduce a hard-to-reverse architectural choice.
