# 21 — Issue a full credit note

**What to build:** Let the owner fully credit one eligible invoice exactly once, with an immutable negative document linked to the original and retained as its own PDF.

**Blocked by:** 19 — Issue a foreign-currency UK VAT invoice; 20 — Lock used client identities and preserve history.

**Status:** completed

- [x] Only an eligible issued invoice can start a full credit; an already credited invoice, a credit note, or an invalid historical state cannot create another credit.
- [x] The owner supplies the approved reason and date, reviews the final credit-note identifier and irreversible effect, and can cancel without issuing the credit note.
- [x] The credit note exactly negates the original document's quantities, client-currency amounts, VAT, sterling VAT evidence, wording, and relevant snapshots rather than recalculating from current settings.
- [x] PDF preparation and verification precede one atomic commit that stores the immutable credit, links both documents, and retains the exact PDF without consuming a client sequence because the identifier is canonically `CN-<INVOICE-ID>`.
- [x] Original and credit history remain immutable and reopen their own retained bytes after restart.
- [x] Outside-scope, GBP VAT, and foreign-currency VAT credit fixtures and production journeys pass the shared validation tasks.
