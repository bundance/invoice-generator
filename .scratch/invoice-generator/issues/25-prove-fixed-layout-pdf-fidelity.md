# 25 — Prove fixed-layout PDF fidelity

**What to build:** Make invoice and credit-note preview, retained PDF, and exported output one stable fixed-layout document system with measurable A4 fidelity.

**Blocked by:** 21 — Issue a full credit note.

**Status:** completed

- [x] Preview and final PDF use one shared document renderer, frozen renderer settings, bundled fonts, approved wordmark assets, scale, and DPI, with no separate formatting implementation.
- [x] Every approved invoice and credit-note fixture fits one A4 page, includes all required text, keeps content within fixed regions, and rejects content that cannot fit instead of clipping or adding a page.
- [x] Raster comparisons cover the reference invoice and accepted invoice and credit-note baselines at the approved pixel and structural tolerances; raw PDF bytes are not used as the fidelity assertion.
- [x] Visual baselines cannot be updated by validation and any difference outside tolerance requires explicit human review and a deliberate baseline change.
- [x] Preview, prepared PDF, retained bytes, reopen, export, and print all agree for outside-scope, GBP VAT, foreign-currency VAT, and full-credit fixtures.
- [x] Automated PDF verification and the required representative human visual review pass with the shared quality gate clean.
