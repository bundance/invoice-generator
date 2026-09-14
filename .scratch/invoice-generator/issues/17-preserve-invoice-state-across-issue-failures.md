# 17 — Preserve invoice state across issue failures

**What to build:** Make every recoverable draft and issue failure explain itself without losing work, corrupting history, or ambiguously consuming a number.

**Blocked by:** 16 — Issue and retain an outside-scope invoice.

**Status:** completed

- [ ] Inject failures into draft writes, PDF generation, PDF verification, retained-PDF writes, temporary state writes, candidate validation, atomic rename, and post-commit open, export, and print actions.
- [ ] Every failure before the durable state rename preserves a recoverable draft, leaves the next number unchanged, creates no historical invoice, and presents the approved visible retry path.
- [ ] Every failure after the durable commit preserves the immutable issued snapshot, retained PDF, and consumed number, and allows the failed secondary action to be retried without reissuing.
- [ ] An issue attempt first retries a failed current-draft save; if it still fails, confirmation stays closed and no PDF, history record, or number is committed.
- [ ] Startup cleanup removes only unreferenced temporary state or prepared-PDF artifacts and never deletes a retained document referenced by durable state.
- [ ] All injected failure scenarios pass without retries, skips, quarantines, or contamination of the real dataset.
