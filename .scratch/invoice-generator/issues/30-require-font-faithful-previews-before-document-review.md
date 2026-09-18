# 30: Require font-faithful previews before document review

**What to build:** Prevent invoice and credit-note review until the visible Live A4 preview has loaded every required bundled Arimo face. The issuer's owner sees an honest preparation state instead of fallback typography, can retry a failed load without losing work, and can proceed as soon as the visible document is known to use the same font family and metrics as the final PDF.

**Blocked by:** 28, Fit Live A4 previews to the available workspace.

**Status:** ready-for-agent

- [ ] The shared preview frame models visible document fonts as loading, ready, or failed.
- [ ] The fixed A4 document remains mounted while fonts load so its inline font definitions exist, but fallback typography is covered and never presented as a valid preview.
- [ ] While fonts load, the preview is marked busy, shows concise preparation feedback, and keeps the associated invoice or credit-note review action unavailable.
- [ ] Readiness requires the complete expected set of bundled Arimo faces and requires every expected face to report loaded. General font-set readiness alone is not accepted as proof.
- [ ] When font loading succeeds, the frame reveals the document, clears its busy state, and enables the associated review action.
- [ ] When font loading fails, the frame keeps the document covered, shows a persistent local alert, keeps review unavailable, and provides Retry.
- [ ] A successful retry reveals the document and restores review without discarding invoice-draft or credit-note work.
- [ ] Older font-loading attempts cannot overwrite a later retry, update an unmounted preview, or otherwise replace newer readiness state.
- [ ] Invoice `Review and issue` and credit-note `Review and issue credit note` obey the same visible-preview readiness rule.
- [ ] Final PDF generation retains its independent font loading, face-count validation, embedded-font verification, and issue-boundary authority.
- [ ] Deterministic shared-frame tests cover delayed loading, success, failure, Retry, stale completion, unmount safety, missing faces, and an errored face without relying on timers or network interception.
- [ ] A production Electron test proves that the visible preview has the complete expected loaded Arimo set, representative regular, italic, and bold checks succeed, and the document's computed font family resolves to Arimo.
- [ ] Existing final PDF font, structure, overflow, and exact raster checks pass without updating approved baselines.
- [ ] The required quality check, full validation gate, and live Electron verification pass before completion.
