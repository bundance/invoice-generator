# 24 — Recover from unreadable or unsupported state

**What to build:** Stop safely when local financial state cannot be trusted and let the owner recover only by selecting a fully validated replacement backup or quitting.

**Blocked by:** 23 — Back up and restore a valid dataset.

**Status:** completed

- [x] Malformed, schema-invalid, internally inconsistent, or unsupported newer state blocks normal application use without modifying the current dataset or retained documents.
- [x] The recovery screen offers only Select validated backup and Quit, clearly explains the detected class of problem, and never guesses, repairs, resets, or silently initializes over existing state.
- [x] A known older schema version is converted only by its explicit release-specific conversion with fixtures proving the exact result; an older application refuses newer state unchanged.
- [x] Invalid replacement archives leave the blocking recovery state and original dataset intact, while a valid archive uses the same atomic whole-dataset restore contract as ordinary restore.
- [x] Malformed input, each supported conversion, unknown newer versions, invalid backups, cancellation, failed restore commit, and successful recovery pass the shared validation tasks.
