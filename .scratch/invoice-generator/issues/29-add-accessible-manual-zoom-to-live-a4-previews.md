# 29: Add accessible manual zoom to Live A4 previews

**What to build:** Let the issuer's owner inspect invoice and credit-note documents at a chosen scale without altering the fixed document or final PDF. The shared preview toolbar provides Fit, zoom out, a readable percentage, and zoom in. Enlarged pages scroll instead of clipping, and returning to Fit restores the responsive whole-page view.

**Blocked by:** 28, Fit Live A4 previews to the available workspace.

**Status:** ready-for-agent

- [ ] The shared invoice and credit-note preview toolbar provides Fit, zoom out, a read-only current percentage, and zoom in.
- [ ] Manual zoom is clamped to 25 through 200 percent inclusive and changes in 10-percentage-point steps.
- [ ] A displayed value of 100 percent means the untransformed CSS size of the fixed A4 document.
- [ ] Zoom in and zoom out leave Fit mode. Manual zoom remains at its absolute percentage when the preview container or application window changes size.
- [ ] Fit explicitly resumes responsive sizing, removes unnecessary overflow, and recentres the complete page.
- [ ] A manually enlarged page that exceeds the viewport remains reachable through ordinary horizontal and vertical scrolling. No page edge is clipped or unreachable.
- [ ] The page is centred while it fits inside the viewport and has a correct scrollable layout box when it does not fit.
- [ ] Zoom state belongs only to the mounted document preview. It does not persist across application restarts or carry into another invoice or credit-note preview.
- [ ] Fit, zoom out, and zoom in have clear accessible names, visible focus treatment, correct disabled states at their bounds, and normal Tab, Enter, and Space operation.
- [ ] The toolbar remains usable at the narrow supported preview width and wraps rather than colliding with the document title or identifier.
- [ ] No application-level zoom shortcuts, drag-to-pan behavior, custom pinch behavior, document reflow, or application-shell zoom is added.
- [ ] Focused React and production Electron tests exercise both document variants, zoom bounds, mode changes, resizing in manual mode, two-axis scrolling, keyboard operation, and returning to Fit through observable behavior.
- [ ] Existing fixed-layout and PDF fidelity checks pass without changing document styles or approved baselines.
- [ ] The required quality check, full validation gate, and live Electron verification pass before completion.
