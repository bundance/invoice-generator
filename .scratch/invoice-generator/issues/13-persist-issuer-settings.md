# 13 — Persist issuer settings

**What to build:** Let the owner enter the one issuer identity used by every future document and reliably recover those settings after restart.

**Blocked by:** 12 — Deliver the secure offline workspace shell.

**Status:** completed

- [ ] Settings captures every approved issuer identity, address, registration, VAT, payment, and wordmark value required by the fixed invoice layout, with the specified normalization and limits.
- [ ] Invalid fields show persistent labels and nearby errors using the approved blur and submit-attempt timing, and validation updates while the owner corrects a revealed error.
- [ ] Changes autosave through the production persistence boundary with visible Saving, Saved on this Mac, and persistent failure states; failed writes retain in-memory edits and offer Retry.
- [ ] Restart restores the last durable issuer settings exactly, while malformed persisted input is rejected rather than guessed or silently normalized.
- [ ] The settings journey and persistence evidence pass the shared quality and automated validation tasks.
