# 14 — Create and manage clients

**What to build:** Let the owner create, edit, and select clients with invoice sequence settings and reusable document defaults.

**Blocked by:** 12 — Deliver the secure offline workspace shell.

**Status:** completed

- [ ] A client can be created with the approved identity, address, tax, currency, VAT-treatment, wording, payment, and sequence fields, with all specified normalization, collision, and boundary rules enforced.
- [ ] Each client has independent invoice and credit-note prefixes and next numbers; complete identifiers are checked case-insensitively for uniqueness across the dataset.
- [ ] An unused client can be edited without changing another client's defaults or counters, and the saved values survive restart.
- [ ] Create invoice can select a client and receive that client's current defaults without consuming either sequence.
- [ ] Client creation, editing, selection, validation, persistence, and empty-state actions pass the shared quality and automated validation tasks.
