# 23 — Back up and restore a valid dataset

**What to build:** Let the owner create a complete local backup and deliberately replace the current dataset from a valid archive without merging histories.

**Blocked by:** 16 — Issue and retain an outside-scope invoice.

**Status:** completed

- [x] Backup writes one versioned archive containing the complete durable state and exactly every retained PDF referenced by it, and validates the completed archive before reporting success.
- [x] Restore inspects and validates the archive, schema version, internal paths, state, retained-document set, and cross-references before offering final confirmation.
- [x] Cancellation or any failure before restore commit leaves the current dataset byte-for-byte usable and reports a recoverable error.
- [x] Successful restore atomically replaces rather than merges the dataset, reloads or restarts into the restored state, and contains no record or PDF from the prior dataset unless it was also present in the archive.
- [x] Backup creation, archive corruption, missing and extra documents, cancelled restore, forced preparation failure, successful replacement, and post-restore issue journeys pass the shared validation tasks.
