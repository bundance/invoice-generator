# Multi-item invoice architecture

Status: Ready for implementation

Decision date: 19 September 2026

Prototype: [accepted Option B](../../.scratch/multi-row-invoice-prototype/candidates/b/index.html)

## Decision summary

Every invoice will contain one ordered, non-empty collection of service lines. The UI will call them items. A one-item invoice will use the same data model and code path as a many-item invoice. There will be no invoice type, mode, conversion step, or legacy single-item branch.

The domain will own service-line validation, money calculations, ordering, aggregation, and error locations. React Hook Form will adapt the collection for the accepted accordion. Its field IDs and open-panel state will remain renderer-local.

Each taxable service line will own its VAT rate. Tax point, VAT treatment, exchange evidence, client, currency, issue date, payment terms, purchase order, and notes will remain invoice-wide.

Net and VAT will round per service line. Invoice totals will sum those rounded service-line values. Foreign-currency sterling totals will group rounded client-currency net values by VAT rate, convert each rate bucket once, calculate sterling VAT for that rate, then sum the buckets.

Workspace schema 7 will be the only current shape. Schema 6 will become a frozen released schema. Every older flat draft, invoice, and credit note will migrate to one service line. Migration will preserve retained PDF filenames, hashes, and bytes. It will never regenerate a PDF.

## User outcome

The accepted Work section will provide these behaviors.

- One item is present when a draft is created.
- Item summaries show order, description, period, quantity, rate, and net amount.
- The open item shows description, period start, period end, billable days, day rate, VAT rate when taxable, and its net, VAT, and gross amounts.
- Add item appends and opens a new item.
- Duplicate item inserts a copy immediately after its source and opens the copy.
- The delete cross removes its item.
- The delete cross is disabled when one item remains.
- Deleting the open item opens the nearest survivor.
- Deleting a closed item keeps the current item open.
- The live A4 preview renders every item in order.
- Invoice totals remain visible outside the accordion.
- Validation opens the item containing the first error and focuses the exact field.

Add item will use the selected client's default description, day rate, and taxable VAT rate. Its period and billable days will start empty. Duplicate item will copy every editable service-line value.

## Scope

This design includes:

- Day-based service lines.
- Per-service-line periods.
- Per-service-line VAT rates for UK-taxable invoices.
- Draft recovery and autosave.
- Immutable issued invoices.
- Full credit notes.
- Replacement invoices.
- GBP, outside-scope, and foreign-currency tax paths.
- Shared preview and PDF rendering.
- Released-state migration.
- Backup and restore.
- Retained PDF verification.

This design does not include:

- A separate single-item mode.
- Reordering.
- Partial credits.
- Hourly, unit, expense, or mixed-unit billing.
- Discounts.
- Client item templates.
- Persisted accordion state.
- Configurable PDF columns.
- A fixed row-count limit.

The existing one-page A4 fit checks remain the authoritative capacity rule.

## Current mechanism

The current system carries one flat service row through every boundary.

```text
React Hook Form
  -> autosaved InvoiceDraftInput
  -> domain review and totals
  -> authoritative main-process review
  -> A4 fit check
  -> immutable issued snapshot
  -> retained PDF and atomic workspace commit
  -> history, full credit, replacement, backup, restore
```

The current flat fields are `serviceDescription`, `periodStart`, `periodEnd`, `billableDays`, and `dayRate`. They appear in the draft, candidate, issued snapshot, credit note, replacement, and document model. The implementation must replace this repeated flat shape, not add an optional second shape beside it.

## Domain model

### Service-line terminology

The UI will use the word Item because it is shorter and matches the accepted prototype. Production domain code will use ServiceLine because the app still supports day-based services rather than arbitrary goods, units, or expenses.

Add a new deep module at `src/domain/invoices/invoice-service-line.ts`.

```ts
export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];

export type TaxableInvoiceServiceLineInput = Readonly<{
  serviceDescription: string;
  periodStart: string;
  periodEnd: string;
  billableDays: string;
  dayRate: string;
  vatRate: string;
}>;

export type OutsideScopeInvoiceServiceLineInput = Omit<TaxableInvoiceServiceLineInput, "vatRate">;

export type InvoiceServiceLineFieldName =
  "serviceDescription" | "periodStart" | "periodEnd" | "billableDays" | "dayRate" | "vatRate";

export type InvoiceServiceLineTotals = Readonly<{
  net: string;
  vat: string;
  gross: string;
}>;
```

Recoverable inputs will keep raw strings. The collection structure is mandatory, but its editable values may be incomplete. The persisted draft parser will require at least one service line.

Reviewed service lines will contain normalized facts and calculated totals.

```ts
type ReviewedInvoiceServiceLineCommon = Readonly<{
  serviceDescription: string;
  periodStart: string;
  periodEnd: string;
  billableDays: string;
  dayRate: string;
  totals: InvoiceServiceLineTotals;
}>;

export type ReviewedTaxableInvoiceServiceLine = ReviewedInvoiceServiceLineCommon &
  Readonly<{ vatRate: string }>;

export type ReviewedOutsideScopeInvoiceServiceLine = ReviewedInvoiceServiceLineCommon;
```

Separate taxable and outside-scope types make an outside-scope VAT rate impossible. No optional `vatRate` will be added to a shared persisted type.

### Review interface

The service-line module will expose one review operation. Arithmetic helpers will remain private.

```ts
type ReviewInvoiceServiceLinesInput =
  | Readonly<{
      kind: "uk-taxable";
      currency: Currency | undefined;
      serviceLines: NonEmptyReadonlyArray<TaxableInvoiceServiceLineInput>;
    }>
  | Readonly<{
      kind: "outside-scope";
      currency: Currency | undefined;
      serviceLines: NonEmptyReadonlyArray<OutsideScopeInvoiceServiceLineInput>;
    }>;

export function reviewInvoiceServiceLines(
  input: ReviewInvoiceServiceLinesInput,
): InvoiceServiceLineReview;
```

`InvoiceServiceLineReview` will return:

- One preview per input service line.
- Every service-line validation error.
- Canonical service lines when all lines are valid.
- Aggregate invoice totals when all money inputs are valid.
- The earliest period start.
- The latest period end.

The operation will hide normalization, validation, per-line arithmetic, aggregation, and canonical construction. Callers will not coordinate those stages.

### Draft shape

`InvoiceDraftInput` will remain a discriminated union by VAT treatment.

```ts
type InvoiceDraftCommonInput = Readonly<{
  clientId: string;
  clientLegalName: string;
  clientPostalAddress: string;
  currencyCode: string;
  issueDate: string;
  paymentTerms: string;
  purchaseOrder: string;
  notes: string;
}>;

export type InvoiceDraftInput =
  | (InvoiceDraftCommonInput &
      Readonly<{
        vatTreatment: "uk-taxable";
        serviceLines: NonEmptyReadonlyArray<TaxableInvoiceServiceLineInput>;
        taxPoint: string;
        exchange: ExchangeDraftInput;
      }>)
  | (InvoiceDraftCommonInput &
      Readonly<{
        vatTreatment: "outside-scope";
        serviceLines: NonEmptyReadonlyArray<OutsideScopeInvoiceServiceLineInput>;
        outsideScopeEvidenceReference: string;
        reverseCharge: boolean;
      }>);
```

`createInvoiceDraft(client)` will create one service line. `createInvoiceServiceLineInput(client)` will provide the same seed for Add item.

Switching clients will keep the current whole-draft replacement behavior. Confirmation will compare the complete ordered collection, not only invoice-wide fields.

### Error locations

Domain errors will use structured locations.

```ts
export type InvoiceDraftErrorLocation =
  | Readonly<{
      kind: "invoice";
      fieldName: InvoiceDraftFieldName;
    }>
  | Readonly<{
      kind: "service-line";
      serviceLineIndex: number;
      fieldName: InvoiceServiceLineFieldName;
    }>;

export type InvoiceDraftError = Readonly<{
  location: InvoiceDraftErrorLocation;
  message: string;
}>;
```

The domain will not expose React Hook Form paths or renderer field IDs. Array position is sufficient because the first release has no reordering and no cross-document service-line reference.

### Item identity

Service lines will not have durable IDs.

Current consumers need order, not identity. Issued lines are immutable. Full credits reverse the complete ordered collection. Replacements copy values into a new draft. Adding a durable ID would create migration rules and cross-document meaning without a current consumer.

React Hook Form will provide an ephemeral field ID for rendering and accordion state. That ID will not enter draft values, IPC, persistence, issued snapshots, backups, or PDFs.

## Money and VAT policy

### Client-currency service lines

Each service line will use the current one-row arithmetic.

1. Normalize billable days, day rate, and VAT rate.
2. Multiply billable days by day rate.
3. Round line net half-up to the invoice currency minor unit.
4. For a taxable line, calculate VAT from the rounded line net and round half-up to the same minor unit.
5. For an outside-scope line, use canonical zero VAT.
6. Add line net and line VAT exactly to produce line gross.
7. Sum the rounded line net, VAT, and gross values independently.

This rule makes displayed line values add exactly to displayed invoice totals. A one-service-line invoice keeps the current result.

The current quarter-day rule and currency precision rule will apply to each service line. Billable days must not exceed that service line's inclusive period. There will be no aggregate billable-day limit because separate services may overlap.

### Invoice-wide dates

The latest service-line period end will replace the current flat `periodEnd` in invoice-wide checks.

- Issue date cannot precede the latest service-line period end.
- Tax point cannot precede the latest service-line period end.
- Tax point cannot follow the issue date.
- Late-issue acknowledgement compares the issue date with the latest service-line period end.

The earliest service-line start and latest service-line end may be used for compact history summaries. The document table will continue to show each service line's own period.

### Tax facts

VAT rate will leave invoice-wide `InvoiceVatTreatment` and live on each taxable service line. Invoice-wide tax facts will retain:

- UK-taxable or outside-scope treatment.
- Tax point.
- Required wording.
- Outside-scope evidence reference.
- Reverse-charge choice.
- Foreign-currency exchange record.

Client settings will keep their standard VAT rate because it seeds taxable service lines.

### Foreign-currency sterling VAT

The repository research requires sterling net and VAT totals at each VAT rate. The schema will therefore store rate buckets inside the foreign-currency sterling summary.

```ts
export type SterlingVatRateBucket = Readonly<{
  vatRate: string;
  clientCurrencyNet: string;
  sterlingTotals: Readonly<{
    net: string;
    vat: string;
    gross: string;
  }>;
}>;

export type SterlingVatSummary = Readonly<{
  exchangeRecord: ExchangeRecord;
  totalsByRate: NonEmptyReadonlyArray<SterlingVatRateBucket>;
  totals: Readonly<{
    net: string;
    vat: string;
    gross: string;
  }>;
}>;
```

The calculation will:

1. Group already rounded client-currency line net values by canonical VAT rate.
2. Preserve each rate's first appearance order.
3. Sum client-currency net within each rate bucket.
4. Convert each bucket net once with the snapshotted exchange rate.
5. Round the sterling bucket net half-up to two decimals.
6. Calculate sterling VAT from that sterling net at the bucket rate.
7. Add each bucket gross.
8. Sum the sterling bucket totals.

The persisted schema will independently repeat this calculation. A changed bucket or aggregate will fail parsing. A one-line foreign-currency invoice will keep the current result.

## Immutable invoices and corrections

### Issued invoice snapshots

`IssuedInvoiceSnapshot` will replace its five flat work fields with a non-empty `serviceLines` collection. Each stored service line will include canonical facts and line totals. The snapshot will continue to store aggregate totals.

The persisted issued schema will verify:

- At least one service line.
- Each line's text, dates, quantity, rate, VAT variant, and totals.
- Aggregate totals equal the sum of line totals.
- Tax facts match taxable or outside-scope line types.
- Foreign-currency rate buckets match taxable service lines and exchange evidence.
- Issue date, tax point, and acknowledgement use the latest period end.
- Existing identity, timezone, retained filename, and uniqueness rules.

### Full credit notes

Full credit will use one exact reversal constructor.

```ts
export function reverseIssuedInvoiceServiceLines(
  serviceLines: NonEmptyReadonlyArray<IssuedInvoiceServiceLine>,
): NonEmptyReadonlyArray<CreditNoteServiceLine>;
```

The constructor will:

- Preserve service-line order.
- Preserve descriptions, periods, positive day rates, and VAT rates.
- Negate every non-zero billable-days value.
- Negate every non-zero line net, VAT, and gross value.
- Preserve canonical zero.
- Negate foreign-currency sterling rate buckets and aggregate totals exactly.
- Avoid multiplication, VAT calculation, or currency conversion.

Issued invoice and credit-note service-line types will remain distinct. The design will not add public signed-money brands to every amount.

`creditNoteMatchesInvoice` will derive the complete expected reversal from the issued invoice and compare it with the stored credit note. Workspace relationship validation will remain authoritative.

### Replacement drafts

`createReplacementDraft` will copy every original service-line fact in order. It will copy description, period, billable days, day rate, and taxable VAT rate. It will not copy calculated amounts. It will clear issue date and retain the correction source in the existing `WorkspaceDraft` wrapper.

## Renderer design

### Form adapter

Add `src/renderer/features/invoice-draft/use-invoice-draft-items.ts`.

This hook will own:

- `useFieldArray` integration.
- Ephemeral field IDs.
- The active accordion field ID.
- Add, duplicate, and delete operations.
- Last-item protection.
- Nearest-survivor selection.
- Mapping a service-line index to the current field ID.

The renderer may use a mutable `InvoiceDraftFormValues` adapter if React Hook Form cannot accept the readonly non-empty domain type. Every save and review boundary must parse the form value through `parseInvoiceDraftInput`, which returns a deep validated copy. The mutable adapter must remain renderer-only.

Expansion and collapse will not update the draft and will not trigger autosave.

### Components

Add these focused components.

| Component                    | Responsibility                                                               |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `invoice-items-editor.tsx`   | Compose the collection, totals summary, and invoice-wide notes fields.       |
| `invoice-item-accordion.tsx` | Accessible list, item headings, panels, add, duplicate, and delete controls. |
| `invoice-item-summary.tsx`   | Collapsed item number, description, period, calculation, and net value.      |
| `invoice-item-fields.tsx`    | Nested service-line fields and line totals.                                  |

`invoice-work-fields.tsx` will become the section-level composition point. Purchase order and notes will remain invoice-wide and will appear after the item collection.

Each component will live in its own file. Collection state will remain in the hook. Pure summaries and fields will receive explicit values and handlers.

### Autosave and deep snapshots

Add, duplicate, delete, and nested field edits must update the `serviceLines` form array so the existing whole-draft subscription reaches `useAutosave`.

`invoiceDraftInputsAreEqual` will compare every invoice-wide field and every ordered service-line field.

The current shallow `{ ...draft }` review and issue copies must be removed. Review and issue will use `parseInvoiceDraftInput(draft)` as the deep snapshot boundary. A later nested edit must not mutate the reviewed value.

### Touched state and focus

Domain errors will identify a service-line index. UI touched state will use the ephemeral field ID plus the service-line field name. This prevents touched state from moving to another item when an earlier item is deleted.

When an error link is followed, the renderer will:

1. Select the Work section.
2. Resolve the error's current service-line index to its field ID.
3. Open that item.
4. Focus the exact control after render.

DOM IDs will include the field ID. They will not use description text or persisted data.

## Shared document model

Replace the single service-row fields in `BillingDocumentModel` with display-only service lines.

```ts
export type BillingDocumentServiceLine = Readonly<{
  serviceDescription: string;
  periodStart: string;
  periodEnd: string;
  billableDays: string;
  dayRate: string;
  vatRate: string | null;
  net: string;
  vat: string;
  gross: string;
}>;
```

Draft, candidate, issued-invoice, and credit-note model builders will all produce this shape. `BillingDocument` will render one table row per service line and one totals block.

The taxable footer will retain tax point and VAT wording. It will no longer show one invoice-wide VAT rate. Each taxable row will expose its rate through the row presentation. The sterling section will render each VAT-rate bucket and the aggregate.

The existing fixed A4 component, live preview frame, hidden Electron renderer, font checks, wordmark checks, fit collector, one-page PDF check, filename rule, and SHA-256 rule will remain.

No accounting rule will depend on CSS height or an item-count limit. Review and issue will keep both authoritative fit checks.

## Persistence and migration

### Schema policy

Add `releasedWorkspaceStateV6Schema` as a frozen exact copy of the current version 6 wire shape. Change the current workspace record to `schemaVersion: 7`.

Use one conversion funnel.

```text
schema 1 -> frozen schema 6 value
schema 2 -> frozen schema 6 value
schema 3 -> frozen schema 6 value
schema 4 -> frozen schema 6 value
schema 5 -> frozen schema 6 value
schema 6 -> schema 7 value
schema 7 -> strict current parse
```

Older conversion code may reuse its current steps, but item migration must live in one `upgradeSchemaSixWorkspaceState` function.

### Flat-to-service-line rules

The schema 6 to 7 conversion will:

1. Move draft description, period, billable days, and day rate into `serviceLines[0]`.
2. Move a taxable draft's VAT rate into that service line.
3. Create no VAT-rate field for an outside-scope service line.
4. Move issued flat work facts into one stored service line.
5. Move the issued taxable rate from invoice-wide tax treatment into that line.
6. Copy issued aggregate totals into that one line's totals.
7. Move credit-note flat work facts into one negative credit line.
8. Move the credit taxable rate into that line.
9. Copy signed aggregate credit totals into that line's totals.
10. Convert a foreign-currency sterling summary into one rate bucket.
11. Preserve every relationship field, date, timestamp, client, issuer, currency, note, and sequence fact.
12. Preserve every retained PDF filename and SHA-256 reference.

The migrated result will be parsed by strict schema 7 and checked by current workspace relationship validation. A mismatch will be a recovery error. Migration will not repair or recalculate a value silently.

Migration will not read, render, rewrite, or regenerate retained PDFs.

### Compatibility proof

Before the current schema shape is used by production callers, a fixture-only conversion spike must convert every released-state fixture and prove:

- One service line contains every former flat fact.
- Line totals equal the former invoice totals.
- Invoice and credit totals remain literal matches.
- Foreign-currency sterling totals remain literal matches.
- Full-credit relationships remain exact.
- Replacement relationships remain exact.
- Retained filenames and hashes are unchanged.
- The referenced retained PDF bytes are unchanged.

Do not add a permanent `legacy-flat | itemized` record union unless this proof finds a real value that deterministic migration cannot preserve.

## Boundary flow

```text
Item accordion
  -> renderer-only form array
  -> parseInvoiceDraftInput deep copy
  -> autosave or review IPC
  -> main-process parsing
  -> reviewInvoiceServiceLines
  -> InvoiceCandidate with canonical service lines
  -> fit check
  -> IssuedInvoiceSnapshot
  -> retained PDF plus atomic schema 7 commit
```

The existing application mutation queue, preload surface, IPC commands, retained document storage, dataset archive protocol, and atomic state rename remain. They will carry a larger parsed value but will not gain item-specific pass-through services.

## File ownership map

| Path                                                                 | Change | Ownership                                                                                                                |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/domain/invoices/invoice-service-line.ts`                        | New    | Inputs, canonical lines, previews, validation, client-currency arithmetic, aggregation, reversal, and error field names. |
| `src/domain/invoices/invoice-service-line.test.ts`                   | New    | Literal line arithmetic, mixed rates, invalid lines, ordering, one-line parity, and exact reversal.                      |
| `src/domain/invoices/invoice-draft-common-fields.ts`                 | Modify | Invoice-wide draft fields only.                                                                                          |
| `src/domain/invoices/invoice-draft.ts`                               | Modify | Draft tax variants, non-empty service lines, invoice-wide review, structured errors, and candidate composition.          |
| `src/domain/invoices/invoice-policy.ts`                              | Modify | Invoice-wide date policy. Remove ownership of the single flat line.                                                      |
| `src/domain/invoices/invoice-vat-treatment.ts`                       | Modify | Invoice-wide treatment and tax point. Taxable rate leaves issued treatment.                                              |
| `src/domain/invoices/invoice-tax-facts.ts`                           | Modify | Tax-fact variants without one invoice-wide rate.                                                                         |
| `src/domain/invoices/exchange-draft.ts`                              | Modify | Review one exchange record against taxable service lines.                                                                |
| `src/domain/invoices/exchange-record.ts`                             | Modify | Sterling VAT-rate buckets and independent verification.                                                                  |
| `src/domain/invoices/issued-invoice.ts`                              | Modify | Immutable service lines and line plus aggregate verification.                                                            |
| `src/domain/invoices/credit-note.ts`                                 | Modify | Exact negative service lines and relationship equality.                                                                  |
| `src/domain/invoices/replacement.ts`                                 | Modify | Ordered service-line facts copied into a fresh draft.                                                                    |
| `src/infrastructure/persistence/released-workspace-state-schemas.ts` | Modify | Frozen exact schema 6.                                                                                                   |
| `src/infrastructure/persistence/workspace-state.ts`                  | Modify | Current schema 7, one v6-to-v7 migration, and current relationships.                                                     |
| `src/documents/invoice-document-model.ts`                            | Modify | Shared display service-line mapping.                                                                                     |
| `src/documents/invoice-document.tsx`                                 | Modify | Ordered service-line rows and totals.                                                                                    |
| `src/documents/invoice-document.css`                                 | Modify | Compact variable-height rows with observable fit regions.                                                                |
| `src/renderer/features/invoice-draft/use-invoice-draft-items.ts`     | New    | Form field IDs, active item, and collection operations.                                                                  |
| `src/renderer/features/invoice-draft/invoice-items-editor.tsx`       | New    | Item collection composition and totals summary.                                                                          |
| `src/renderer/features/invoice-draft/invoice-item-accordion.tsx`     | New    | Accessible accepted Option B interaction.                                                                                |
| `src/renderer/features/invoice-draft/invoice-item-summary.tsx`       | New    | Collapsed item summary.                                                                                                  |
| `src/renderer/features/invoice-draft/invoice-item-fields.tsx`        | New    | Nested controls and line totals.                                                                                         |
| `src/renderer/features/invoice-draft/invoice-work-fields.tsx`        | Modify | Compose items, purchase order, and notes.                                                                                |
| `src/renderer/features/invoice-draft/use-invoice-draft-form.ts`      | Modify | Form adapter and deep save snapshots.                                                                                    |
| `src/renderer/features/invoice-draft/use-invoice-draft-review.ts`    | Modify | Structured errors, stable touched keys, accordion opening, and focus.                                                    |
| `src/renderer/features/invoice-draft/use-invoice-issue.ts`           | Modify | Deep immutable reviewed draft snapshots.                                                                                 |
| `src/renderer/features/invoice-draft/invoice-issue-dialog.tsx`       | Modify | Item count, aggregates, and VAT-rate summary.                                                                            |
| `CONTEXT.md`                                                         | Modify | Replace the one-service-line product boundary with the accepted item model.                                              |

Existing test fixtures and Electron journeys that construct an invoice or credit note will also change. Any seeded issued record must keep a matching retained PDF file and SHA-256.

## Implementation sequence

### Slice 1. Conversion proof and service-line kernel

- Freeze a literal schema 6 fixture contract.
- Run the flat-to-one-line conversion spike across every released fixture.
- Add `invoice-service-line.ts` and focused tests.
- Prove one-line parity for GBP, outside-scope, zero-decimal currency, and foreign currency.
- Prove two-line per-line rounding and aggregation with literal expected values.
- Prove exact reversal.

Exit proof: focused domain and conversion tests pass with no production caller switched.

### Slice 2. Draft review and tax policy

- Move recoverable drafts to non-empty service lines.
- Add structured error locations and previews.
- Add latest-period date rules.
- Move VAT rate into taxable service lines.
- Add sterling VAT-rate buckets.
- Replace shallow equality and snapshot logic in the domain-facing renderer boundary.

Exit proof: domain, tax, exchange, and draft recovery tests pass.

### Slice 3. Immutable records and schema 7

- Move issued invoices, credit notes, and replacements to service lines.
- Add line and aggregate persisted refinements.
- Add exact full-credit reversal and correction-chain checks.
- Add frozen schema 6 and current schema 7 parsing.
- Prove versions 1 through 6 reach the same schema 7 facts.
- Prove retained PDF references and bytes remain unchanged.

Exit proof: domain, persistence, application, backup, restore, and failure-path tests pass.

### Slice 4. Shared document rows

- Change `BillingDocumentModel` to display service lines.
- Render invoice and credit-note rows in order.
- Render sterling totals per VAT rate.
- Update fit regions and document tests.
- Produce candidate invoice and credit-note raster changes.

Exit proof: component, fit, structural PDF, and selected Electron PDF tests pass. Human approval is required before baseline updates are accepted.

### Slice 5. Accepted accordion UI

- Add the form adapter and focused item components.
- Implement add, duplicate, delete, and active-item behavior.
- Implement last-item protection.
- Implement stable touched state and first-error focus.
- Prove autosave, in-flight changes, restart recovery, client reselection, and final review snapshots.

Exit proof: React tests cover visible behavior and the production Electron app matches the accepted prototype at the supported 1040-pixel window.

### Slice 6. Integrated proof

- Create, recover, issue, reopen, export, and print a multi-item invoice.
- Issue its full credit note and verify every negative line.
- Create and issue a replacement with copied lines.
- Prove mixed-generation correction chains.
- Prove backup and restore with matching retained bytes.
- Update release-plan evidence selectors if new journey titles are introduced.
- Run `timeout 300 vp run check:quality`.
- Run focused tests throughout.
- Run `timeout 900 vp run validate`.
- Run the live Invoice Generator verification skill and retain user-visible evidence.

Exit proof: the full gate passes, the live journey passes, and changed PDF baselines have human approval.

## Test contract

Tests will assert public behavior and literal outputs.

### Domain

- One-line parity with every current tax path.
- Two distinguishable service lines in preserved order.
- Per-line net and VAT rounding.
- Aggregate net, VAT, and gross.
- Mixed VAT rates.
- Sterling totals by VAT rate.
- Exact item-indexed errors.
- Empty collection rejection.
- Taxable and outside-scope type mismatch rejection.
- Persisted line or aggregate drift rejection.
- Latest-period date rules.

### Corrections

- Full credit copies and negates every stored service line.
- Original invoice remains unchanged.
- Credit relation remains exact after restart.
- Replacement copies all service-line facts and order.
- Replacement editing and issue preserve the correction source.
- Failure before commit preserves the complete draft and invoice number.

### Persistence

- Released schemas 1 through 6 migrate to schema 7.
- Flat values become one service line without value changes.
- Retained filename, hash, and bytes stay unchanged.
- Backup and restore preserve multi-line drafts, issued invoices, credits, and correction chains.
- Unknown fields, missing lines, inconsistent totals, and newer versions fail recovery.

### Renderer

- Add opens a seeded new item.
- Duplicate inserts after its source and opens the copy.
- Delete active opens the nearest survivor.
- Delete inactive keeps the active item.
- Last delete is disabled and labelled.
- Nested edits autosave.
- Accordion expansion does not autosave.
- First item error opens and focuses the exact field.
- In-flight saves do not lose newer array changes.
- Review and issue use deep snapshots.

### Documents and Electron

- One visible document row per service line.
- Invoice and credit rows preserve order.
- Each row shows description, period, quantity, rate, net, and VAT.
- Totals equal visible rows.
- Foreign-currency sterling values appear at each VAT rate.
- Representative multi-line invoices and credits fit one page.
- Deliberately excessive content fails before number consumption.
- Issued PDFs retain identifier-only filenames, embedded fonts, selectable text, approved raster output, and verified SHA-256.
- Open, Export, and Print use retained bytes after restart.

## Tradeoffs

- Per-line rounding can differ from rounding one aggregate unrounded amount. The chosen rule keeps row arithmetic auditable and makes visible rows add to visible totals.
- Multi-rate foreign-currency VAT adds persisted rate buckets. The extra structure is required to reproduce and display sterling values at each VAT rate.
- Index-based domain errors rely on regenerating review after collection edits. This is acceptable because reordering is out of scope and review already runs from the current full draft.
- The one-page A4 contract may reject otherwise valid large invoices. The design keeps that limit honest instead of inventing an accounting row cap.
- Schema 7 migrates immutable facts in memory. Literal fixture proof and retained-byte checks reduce that risk without carrying a permanent legacy union.

## Arena decision

Three architectures were compared.

| Candidate                        | Result              | Reason                                                                                                                             |
| -------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Domain-first service-line kernel | Selected            | One canonical model, direct migration, local renderer identity, and the clearest delivery sequence.                                |
| Signed billing ledger            | Grafted selectively | Strongest foreign-currency and reversal policy, but public ledger vocabulary and sign brands exceeded the product's current scope. |
| Permanent legacy record variants | Rejected            | Avoided one deterministic migration but imposed permanent branching across history, corrections, tests, and readers.               |

The final design uses the domain-first structure. It grafts VAT-rate sterling buckets, an exact reversal constructor, and the exhaustive correction compatibility matrix. It rejects a permanent flat-versus-itemized union, durable service-line IDs, public ledger types, and public arithmetic helpers.

## Remaining validation risks

These items do not block implementation of the kernel and migration proof.

- Confirm the mixed-rate foreign-currency examples against the repository's UK VAT research before accepting production fixtures.
- Confirm how many realistic service lines fit the approved A4 layout during the document slice.
- Confirm whether the issue and history screens should list rates or use the text “Multiple rates.”
- Confirm React Hook Form typing against the readonly non-empty domain collection. Use the renderer-only mutable adapter if required.
