# Prototype the invoice-creation experience

Type: prototype
Status: resolved
Blocked by: none

## Question

What concrete form, navigation, validation, preview, history, client-management, and settings interactions make the fixed invoice workflow fast and understandable without adding a dashboard or template system? Settings must cover manual backup, whole-dataset restore, and the unreadable-data recovery state defined by [Define the local data contract](04-define-the-local-data-contract.md).

## Comments

### Prototype ready for review

- Asset: [Invoice creation experience prototype](../prototypes/invoice-creation/README.md)
- Run from the repository root with `vp run prototype:invoice-creation`, then open `http://127.0.0.1:4173/?variant=B`.
- `A` is Calm workbench: persistent destinations with the form and A4 preview side by side.
- `B` is Document studio: a document-led canvas with a focused section inspector.
- `C` is Keyboard ledger: a compact worksheet with a sticky issue action.
- Settings includes manual whole-dataset backup and replacement restore. The recovery-state link demonstrates how unreadable data stops normal use and offers Restore without modifying the unreadable dataset.
- The issue transition is a separate confirmation that states the invoice ID, total, and immutability consequence before consuming the number.

The human chose `B`, Document studio. `A` and `C` remain in the prototype as rejected primary-source evidence.

### Accessibility scope superseded

[Define the validation and acceptance contract](08-define-the-validation-and-acceptance-contract.md) removes formal accessibility and screen-reader announcements from the release gate for this one-user internal app. The keyboard order, validation focus, dialog focus containment, Escape behavior, and focus restoration decisions remain required functional behavior.

## Answer

Use the Document studio direction:

- Keep the four destinations in a persistent top navigation, with New Invoice as the default. Do not add a dashboard.
- Make the live A4 document the dominant canvas. Put the editable Client, Work, and Tax & issue sections in a focused inspector beside it, and preserve the draft when moving between destinations.
- Show the selected client's currency, day rate, VAT defaults, and next invoice identifier in context. The identifier is a preview only until the invoice is issued.
- Keep labels persistent and place validation messages beside their fields. When issue is attempted, also show a linked error summary, move focus to it, and leave the issue action available so the user can discover what must be fixed.
- Open a final confirmation before issue. It must show the proposed invoice identifier, client, total, dates, VAT treatment, and irreversible effect. The final action is labelled `Issue <identifier>` and is the only action that consumes the next number. Trap focus within the confirmation and restore it to the triggering control when the confirmation closes.
- Show autosave and validation outcomes without interrupting input. Formal screen-reader announcements are not required. Support a logical keyboard order through navigation, form sections, preview controls, and the issue flow.
- Present issued invoices as immutable history with identifier, client, issue date, total, document state, and retained-PDF actions. The correction interaction remains owned by ticket 10.
- Present clients as a searchable list and editor. Lock a client's invoice prefix after its first issued invoice; changed defaults affect future drafts only.
- Split Settings into issuer and bank details plus one complete-dataset backup card. Explain that backups are unencrypted. Restore must validate an archive, summarize what it contains, and require explicit confirmation that the current dataset will be replaced rather than merged.
- If stored data is unreadable, replace normal navigation with a blocking recovery screen. Do not mutate the unreadable dataset. Offer only selecting a backup for validated replacement or quitting the app.

Calculation and field-validation rules remain owned by ticket 09, correction interactions by ticket 10, and production PDF fidelity by ticket 07.
