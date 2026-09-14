# 16 — Issue and retain an outside-scope invoice

**What to build:** Let the owner irreversibly issue a valid outside-scope invoice, retain its exact PDF, and reopen or export that historical artifact.

**Blocked by:** 15 — Build a recoverable outside-scope draft.

**Status:** completed

- [ ] Issue confirmation shows the final identifier, client, dates, totals, VAT treatment, warnings, and irreversible effect, and contains focus until confirmed, cancelled, or closed with Escape.
- [ ] Confirmation reruns normalization, parsing, validation, calculation, sequence lookup, warning acknowledgement, and renderer-fit checks against fresh state before committing.
- [ ] The final PDF is prepared and verified before one atomic durable commit stores the immutable invoice snapshot, associates the retained bytes, advances the selected client's sequence exactly once, and clears the draft.
- [ ] The invoice appears in history with its immutable facts and can be opened, exported, or printed only from the exact retained PDF rather than regenerated.
- [ ] Cancellation and every ordinary action before the durable commit leave the draft and next number unchanged.
- [ ] The successful issue, restart, history, retained-document, and next-number evidence passes the shared validation tasks.
