# 12 — Deliver the secure offline workspace shell

**What to build:** Give the owner a secure, offline Invoice Generator workspace with the approved destinations and useful empty states, backed by the initial local dataset.

**Blocked by:** 11 — Establish the validated application foundation.

**Status:** completed

- [x] Launch into the approved Document studio layout with Create invoice, Invoices, Clients, and Settings destinations, each with an empty state that explains and offers its next available action.
- [x] Initialize the fixed local dataset and retained-document area at the approved macOS location without adding configurable storage, accounts, authentication, cloud services, analytics, update checks, or network requests.
- [x] Enforce a single application instance and prevent a second process from becoming another dataset writer.
- [x] Run the renderer with sandboxing and context isolation enabled and Node integration disabled; expose only a narrow typed preload API.
- [x] Validate every preload input and IPC sender, reject unexpected navigation, new windows, and external URLs, and cover those guarantees with automated production-shell checks.
- [x] Start, restart, build, package, and launch the shell through the authoritative validation path with all quality checks passing.
