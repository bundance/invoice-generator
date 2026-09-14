# Define the local data contract

Type: grilling
Status: resolved
Blocked by: 02

## Question

What versioned JSON schema, atomic-write protocol, migration policy, PDF retention policy, and backup-and-restore behavior safely preserve issuer settings, clients, the recoverable draft, sequences, voided numbers, issued invoices, credit notes, and replacement links over time?

## Comments

### Decision round 1

- Keep one active dataset in Electron's application-data directory by default, and let the user select an alternative data directory.
- Store structured data in one versioned JSON state file and keep immutable PDFs in an application-managed documents directory beside it.
- Do not add application-level encryption to the live dataset or backups. Rely on operating-system protection and warn users that backups contain financial and personal information.

### Decision round 2 correction

- Keep the live dataset in Electron's application-data directory. Do not let the user relocate it.
- Use a minimal crash-safety protocol. Do not add transaction markers, automatic rollback, or a repair subsystem.

### Decision round 3

- Include `schemaVersion: 1` in the initial JSON contract. Add a tested one-time conversion only when a future release changes that contract.
- Provide manual Create backup and Restore backup actions for the complete JSON-and-PDF dataset. Restore replaces the dataset; it never merges records.

## Answer

The app owns one dataset in Electron's application-data directory. Users cannot relocate it. The app permits only one running instance to write the dataset.

The dataset contains one `state.json` file and an application-managed directory of retained PDFs. `state.json` has this top-level contract:

- `schemaVersion: 1`
- current issuer settings
- clients, including each client's invoice prefix and next invoice number
- the single recoverable invoice draft, or `null`
- immutable issued-invoice snapshots
- immutable credit-note snapshots
- voided invoice numbers
- replacement links, stored on replacement invoices as `replacesInvoiceId`

Credit notes link to their original invoice by `originalInvoiceId`. The contract stores each issued invoice and credit note as a complete snapshot of the issuer, client, service, currency, VAT, conversion, totals, and issue facts required to understand and render it. Mutable settings and client records are never inputs when rendering an issued document.

Calendar dates use `YYYY-MM-DD`, event timestamps use UTC ISO 8601 strings, and decimal quantities and monetary values use canonical base-10 strings rather than JSON floating-point numbers.

Every state change writes and validates `state.json.tmp`, then renames it over `state.json`. Issuing writes the final PDF before committing the corresponding state change. The state-file rename is the point at which the invoice number is consumed. If the app stops before that commit, startup may delete the unreferenced PDF or temporary file. The app does not add a transaction journal, automatic rollback, or a repair subsystem. If `state.json` cannot be read or validated, normal use stops and the app offers Restore instead of guessing.

Each issued PDF is retained indefinitely as the exact issued artifact. The app does not regenerate it for export and does not offer individual PDF deletion.

Settings provides two manual actions:

- Create backup writes one unencrypted archive containing `state.json` and every referenced PDF.
- Restore validates a selected archive, asks for confirmation, and replaces the complete current dataset. It never merges records.

The initial state uses `schemaVersion: 1`. A future release adds a tested one-time conversion only when it changes the JSON contract. The conversion reads a known older version and writes the current version using the same temporary-write and rename protocol. Unknown or newer versions are left unchanged and cannot be opened. This is a version field and a release-specific conversion, not a general migration framework.

There is no selectable data directory, scheduled backup, cloud backup, incremental backup, backup merging, application-level encryption, or custom recovery system.
