# 15 — Build a recoverable outside-scope draft

**What to build:** Let the owner compose, preview, autosave, resume, and discard one unnumbered outside-scope invoice draft without risking an invoice number.

**Blocked by:** 13 — Persist issuer settings; 14 — Create and manage clients.

**Status:** completed

- [ ] The owner can enter the approved single service line, service period, dates, quantity, unit price, currency, notes, purchase order, and outside-scope wording, with client defaults applied only as editable starting values.
- [ ] Exact decimal calculations and currency formatting update the fixed-layout preview from the same normalized candidate used for later issue validation.
- [ ] Validation follows the approved field, summary, focus, and non-blocking late-issue-date warning behavior; the issue action remains discoverable while invalid.
- [ ] Draft edits autosave with visible status, survive restart, and present the approved resume-or-discard choice when recovery is needed.
- [ ] Previewing, validating, cancelling, discarding, restarting, and save failure never assign or consume an invoice number.
- [ ] The complete draft journey passes focused React, persistence, and production Electron checks through the shared validation tasks.
