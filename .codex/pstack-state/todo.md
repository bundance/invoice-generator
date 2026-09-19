# Multi-item invoice architecture

- [x] Ground
- [x] Sketch
- [x] Agree. Deliver the architecture package because the user asked to get ready to build, not to implement production code.
- [x] Implement. Skipped because build readiness is the requested stopping point.
- [x] Scrap. Not entered because the chosen synthesis passed candidate screening and repository verification.

## Grounding work

- [x] Trace the invoice draft, persistence, and migration paths.
- [x] Trace the Work editor and form-state ownership.
- [x] Trace PDF rendering, credit notes, replacements, backup and restore, and test coverage.

## Architecture arena

- [x] Frame the candidate contract and rubric.
- [x] Produce at least two structurally distinct designs.
- [x] Cross-judge all candidates.
- [x] Pick a base and graft stronger details from the other candidates.
- [x] Screen the synthesis against the architecture red flags.
- [x] Verify every proposed file, type, caller, and delivery check against the repository.

## Deliverable

- [x] Write the implementation-ready architecture document.
- [x] Record open product decisions separately from verified repository constraints.
- [x] Provide build slices with a check at the end of each slice.

# Multi-item invoice implementation

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Slice 1: Prove schema 6 conversion and add the service-line kernel.
- [x] Slice 2: Move draft review and tax policy to service lines.
- [x] Slice 3: Move immutable records and persistence to schema 7.
- [x] Slice 4: Render shared document rows and capture candidate raster evidence.
- [x] Slice 5: Build the accepted accordion UI and nested autosave behavior.
- [x] Slice 6: Prove the integrated application paths.
- [x] Phase D: Audit the decision trail against the run.
- [x] Phase E: Verify the real product and hand back.
- [x] Focused simplification pass.
- [x] No-comments review.
- [x] Independent architecture and standards review.
- [x] Commit the coherent feature on multi-item-invoices.
- [ ] Opening a PR. Skip: the user explicitly forbade push, PR, merge, and publication.

## Throughput checkpoint

- [x] Blocking first steps. Ground the current paths, hydrate the pinned runtime, freeze schema 6, and establish the conversion and kernel tests before callers move.
- [x] Independent workstreams. Read-only domain, persistence, and renderer exploration ran in parallel. All source writes stay serialized in this worktree.
- [x] Shared mutable state. One writer owns the branch, fixtures, generated evidence, and Git history.
- [x] Smallest safe decomposition. Use the architecture's six slices. End each slice with focused checks and an audit-log row.
