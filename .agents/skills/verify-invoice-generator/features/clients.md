# Clients

## User behavior

Clients hold identity, invoice numbering, currency, tax treatment, rates, and payment defaults. Creating, selecting, editing, or copying a client does not consume an invoice number. After the first issued invoice uses a client, its identity and numbering stay locked; creating a new client from it remains available.

## Source entry points

- `src/renderer/features/clients/clients-page.tsx`
- `src/renderer/features/clients/client-editor.tsx`
- `src/renderer/features/clients/client-identity-fields.tsx`
- `src/renderer/features/clients/client-invoice-default-fields.tsx`
- `src/renderer/features/clients/client-sequence-fields.tsx`
- `tests/e2e/clients.spec.ts`

## Live recipe

Open Clients from a fresh run. Create the first client with a unique legal name and invoice prefix, then capture `Client saved on this Mac`. Edit one future default and save it. If the run already contains an issued invoice, confirm identity fields are read-only and `Create new from this client` opens a separate new-client form.
