# 22 — Create and issue a linked replacement

**What to build:** After a full credit, let the owner optionally create an editable unnumbered replacement draft and later issue it as a new invoice linked through the correction chain.

**Blocked by:** 21 — Issue a full credit note.

**Status:** completed

- [x] Successful credit offers Create replacement and Done without creating, numbering, or issuing a replacement automatically.
- [x] Create replacement copies only the approved editable starting facts, records the correction relationship, and makes current issuer and client defaults explicit without rewriting the original or credit snapshots.
- [x] The replacement remains an ordinary recoverable draft: editing, previewing, validation, cancellation, discard, restart, and pre-commit failure do not consume a number.
- [x] Issuing the replacement uses the client's then-current next invoice number exactly once and records links among original invoice, full credit note, and replacement invoice.
- [x] History presents the complete correction chain and opens each member's exact retained PDF.
- [x] Done, replacement creation, cancellation, failure, successful issue, restart, and chain-history scenarios pass the shared validation tasks.
