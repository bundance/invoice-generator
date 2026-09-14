# 20 — Lock used client identities and preserve history

**What to build:** Protect legal history by locking identity fields after a client's first issued document while still allowing safe future changes through a new client record.

**Blocked by:** 16 — Issue and retain an outside-scope invoice; 19 — Issue a foreign-currency UK VAT invoice.

**Status:** completed

- [ ] After the first invoice is issued for a client, fields whose alteration would rewrite legal identity or numbering history become immutable while explicitly approved future defaults remain editable.
- [ ] The owner can create a new client from the locked record for a changed legal identity without sharing or rewinding either client's sequences.
- [ ] Every issued document keeps its complete issuer, client, calculation, tax, acknowledgement, and renderer snapshot even when current settings or permitted client defaults later change.
- [ ] Historical lists, details, previews, and retained PDFs use the issued snapshot rather than joining mutable current records.
- [ ] Locking, copy-to-new-client, independent sequences, changed defaults, restart, and historical-stability scenarios pass the shared validation tasks.
